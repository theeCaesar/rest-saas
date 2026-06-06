const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Meal = require("../models/mealModel");
const Client = require("../models/clientModel");
const ClientDebt = require("../models/clientDebtModel");
const User = require("../models/userModel");
const Restaurant = require("../models/restaurantModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { logActivity } = require("../utils/activityLogger");

exports.createOrder = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;
  req.body.cashier = req.user._id;

  // if new client, create
  if (req.body.newClient) {
    const client = await Client.create({
      ...req.body.newClient,
      restaurant: req.body.restaurant,
    });
    req.body.client = client._id;
  }

  // process items: deduct stock, calc prices
  const processedItems = [];
  for (const item of req.body.items) {
    const meal = await Meal.findById(item.meal);
    if (!meal) {
      return next(new AppError(`Meal ${item.meal} not found`, 404));
    }

    let variant;
    if (item.variantId) {
      variant = meal.variants.id(item.variantId);
    } else {
      // pick first active variant with stock
      variant = meal.variants.find(
        (v) => v.isActive && v.quantityInStock > 0,
      );
    }
    if (!variant) {
      return next(new AppError(`No available stock for ${meal.name}`, 400));
    }

    let quantityToDeduct = item.quantity;
    if (item.sellingMode === "piece") {
      quantityToDeduct = item.quantity; // pieces
    }

    if (variant.quantityInStock < quantityToDeduct) {
      return next(
        new AppError(
          `Insufficient stock for ${meal.name}. Available: ${variant.quantityInStock}`,
          400,
        ),
      );
    }

    // deduct
    variant.quantityInStock -= quantityToDeduct;
    await meal.save();

    const originalPrice = item.sellingMode === "piece"
      ? variant.originalPrice / (variant.piecesPerPack || 1)
      : variant.originalPrice;

    const sellingPrice = item.sellingPrice || (item.sellingMode === "piece"
      ? (variant.recommendedPiecePrice || variant.recommendedSellingPrice / (variant.piecesPerPack || 1))
      : (variant.recommendedSellingPrice || variant.originalPrice));

    const totalPrice = sellingPrice * item.quantity;
    const profit = totalPrice - originalPrice * item.quantity;

    processedItems.push({
      meal: meal._id,
      mealName: meal.name,
      variantId: variant._id,
      originalPrice,
      recommendedSellingPrice: variant.recommendedSellingPrice,
      sellingPrice,
      quantity: item.quantity,
      sellingMode: item.sellingMode || "pack",
      piecesPerPack: variant.piecesPerPack,
      totalPrice,
      profit,
      batchNumber: variant.batchNumber,
      expireDate: variant.expireDate,
      section: meal.section,
      supplier: variant.supplier,
    });
  }

  req.body.items = processedItems;
  const order = await Order.create(req.body);

  // update cashier stats
  await User.findByIdAndUpdate(req.user._id, {
    $inc: {
      totalOrders: order.finalAmount,
      totalProfit: order.totalProfit,
      totalOrdersCount: 1,
    },
  });

  // update restaurant stats
  await Restaurant.findByIdAndUpdate(req.body.restaurant, {
    $inc: {
      totalRevenue: order.finalAmount,
      totalProfit: order.totalProfit,
    },
  });

  // update meal stats
  for (const item of processedItems) {
    await Meal.findByIdAndUpdate(item.meal, {
      $inc: {
        totalSold: item.quantity,
        totalRevenue: item.totalPrice,
        totalProfit: item.profit,
      },
    });
  }

  // update client stats
  if (order.client) {
    await Client.findByIdAndUpdate(order.client, {
      $inc: { totalPurchases: 1, totalSpent: order.finalAmount },
      lastVisit: new Date(),
    });
  }

  // if payment method is "later", create a client debt record
  if (order.paymentMethod === "later") {
    if (!order.client) {
      return next(new AppError("A client must be selected for pay-later orders", 400));
    }
    await ClientDebt.create({
      restaurant: order.restaurant,
      client: order.client,
      order: order._id,
      createdBy: req.user._id,
      originalAmount: order.finalAmount,
      currentAmount: order.finalAmount,
      amountPaid: 0,
      dueDate: req.body.debtDueDate || undefined,
      notes: req.body.debtNotes || undefined,
    });
    await Client.findByIdAndUpdate(order.client, {
      $inc: { totalDebt: order.finalAmount },
    });
  }

  await logActivity({
    user: req.user._id,
    restaurant: req.body.restaurant,
    action: "order",
    entityType: "Order",
    entityId: order._id,
    description: `Order ${order.orderNumber} - Amount: ${order.finalAmount}`,
  });

  res.status(201).json({
    status: "success",
    data: { order },
  });
});

exports.getAllOrders = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.cashier) filter.cashier = req.query.cashier;
  if (req.query.client) filter.client = req.query.client;
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
  }
  if (req.query.orderNumber) {
    filter.orderNumber = new RegExp(String(req.query.orderNumber), "i");
  }
  if (req.query.isReturn !== undefined) {
    filter.isReturn = req.query.isReturn === "true";
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("cashier", "name email")
      .populate("client", "name phone")
      .populate("items.section", "name description")
      .lean({ virtuals: true }),
    Order.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    results: orders.length,
    total,
    data: { orders },
  });
});

exports.getOrder = factory.getOne(
  Order,
  [
    { path: "cashier", select: "name email" },
    { path: "client", select: "name phone" },
    { path: "items.meal", select: "name barcode" },
    { path: "items.section", select: "name" },
    { path: "originalOrder", select: "orderNumber finalAmount createdAt" },
  ],
  "order",
);

exports.deleteOrder = factory.deleteOne(Order, "order");

exports.getMyOrders = catchAsync(async (req, res, next) => {
  let filter = { cashier: req.user._id };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .populate("client", "name phone")
    .populate("items.section", "name description")
    .limit(parseInt(req.query.limit) || 50)
    .lean();

  const total = await Order.countDocuments(filter);

  res.status(200).json({
    status: "success",
    results: orders.length,
    total,
    data: { orders },
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/orders/:id/returns
// All return transactions linked to a specific original order
// ---------------------------------------------------------------------------
exports.getOrderReturns = catchAsync(async (req, res, next) => {
  const filter = {
    originalOrder: req.params.id,
    isReturn: true,
  };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const returns = await Order.find(filter)
    .sort({ createdAt: -1 })
    .populate("cashier", "name")
    .lean({ virtuals: true });

  res.status(200).json({
    status: "success",
    results: returns.length,
    data: { returns },
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/orders/:id/return
//
// Full calculation breakdown per returned item:
//   itemReturnTotal  = item.sellingPrice  × returnQty
//   itemReturnCost   = item.originalPrice × returnQty
//   itemReturnProfit = itemReturnTotal − itemReturnCost
//
// Aggregated across all returned items:
//   returnTotalAmount = Σ itemReturnTotal
//   returnTotalProfit = Σ itemReturnProfit
//   returnTotalCost   = Σ itemReturnCost
//
// Proportional discount (preserves the original discount ratio):
//   discountFraction     = originalOrder.discount / originalOrder.totalAmount
//   proportionalDiscount = round(returnTotalAmount × discountFraction)
//   netRefund            = returnTotalAmount − proportionalDiscount
//   netProfit            = returnTotalProfit − proportionalDiscount
// ---------------------------------------------------------------------------
exports.returnOrder = catchAsync(async (req, res, next) => {
  // 1. Load and validate the original order
  const originalOrder = await Order.findOne({
    _id: req.params.id,
    restaurant: req.restaurantScope,
  });

  if (!originalOrder) return next(new AppError("Order not found", 404));
  if (originalOrder.isReturn) {
    return next(new AppError("Cannot process a return on a return transaction", 400));
  }
  if (originalOrder.returnStatus === "full") {
    return next(new AppError("This order has already been fully returned", 400));
  }

  const { items: returnItems, refundMethod = "cash", reason, notes } = req.body;

  if (!returnItems || !returnItems.length) {
    return next(new AppError("At least one item must be included in the return", 400));
  }

  // 2. Validate every returned item and pre-compute amounts (no DB writes yet)
  const computed = [];

  for (const ri of returnItems) {
    const originalItem = originalOrder.items.id(ri.orderItemId);
    if (!originalItem) {
      return next(
        new AppError(`Order item ${ri.orderItemId} not found on this order`, 404),
      );
    }

    const returnQty = parseInt(ri.quantity, 10);
    if (!returnQty || returnQty <= 0) {
      return next(new AppError("Return quantity must be a positive integer", 400));
    }

    const alreadyReturned = originalItem.returnedQuantity || 0;
    const maxReturnable   = originalItem.quantity - alreadyReturned;

    if (returnQty > maxReturnable) {
      return next(
        new AppError(
          `Cannot return ${returnQty} of "${originalItem.mealName}". ` +
          `Already returned: ${alreadyReturned}, remaining returnable: ${maxReturnable}`,
          400,
        ),
      );
    }

    const itemReturnTotal  = originalItem.sellingPrice  * returnQty;
    const itemReturnCost   = originalItem.originalPrice * returnQty;
    const itemReturnProfit = itemReturnTotal - itemReturnCost;

    computed.push({
      originalItem,
      returnQty,
      itemReturnTotal,
      itemReturnCost,
      itemReturnProfit,
    });
  }

  // 3. Aggregate totals
  const returnTotalAmount = computed.reduce((s, c) => s + c.itemReturnTotal,  0);
  const returnTotalProfit = computed.reduce((s, c) => s + c.itemReturnProfit, 0);

  // 4. Proportional discount — keeps the same discount ratio as the original order
  const discountFraction     = originalOrder.totalAmount > 0
    ? (originalOrder.discount || 0) / originalOrder.totalAmount
    : 0;
  const proportionalDiscount = Math.round(returnTotalAmount * discountFraction);
  const netRefund            = returnTotalAmount - proportionalDiscount;
  // Discount came off the selling price, so it also reduced realised profit
  const netProfit            = returnTotalProfit - proportionalDiscount;

  // 5. Restore stock back to the exact variant it was taken from
  for (const { originalItem, returnQty } of computed) {
    const meal = await Meal.findById(originalItem.meal);
    if (meal && originalItem.variantId) {
      const variant = meal.variants.id(originalItem.variantId);
      if (variant) {
        variant.quantityInStock += returnQty;
        await meal.save();
      }
    }
  }

  // 6. Build return order items — mirror the original item data for the returned qty
  const returnOrderItems = computed.map(
    ({ originalItem, returnQty, itemReturnTotal, itemReturnProfit }) => ({
      meal:                 originalItem.meal,
      mealName:             originalItem.mealName,
      variantId:               originalItem.variantId,
      originalPrice:           originalItem.originalPrice,
      recommendedSellingPrice: originalItem.recommendedSellingPrice,
      sellingPrice:            originalItem.sellingPrice,
      quantity:                returnQty,
      sellingMode:             originalItem.sellingMode,
      piecesPerPack:           originalItem.piecesPerPack,
      totalPrice:              itemReturnTotal,
      profit:                  itemReturnProfit,
      batchNumber:             originalItem.batchNumber,
      expireDate:              originalItem.expireDate,
      section:                 originalItem.section,
      supplier:                originalItem.supplier,
    }),
  );

  // 7. Create the return Order document
  // orderNumber uses RT- prefix so it's distinct from regular SL- orders
  const returnOrder = await Order.create({
    orderNumber:    `RT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
    restaurant:      originalOrder.restaurant,
    cashier:       req.user._id,
    client:        originalOrder.client,
    items:         returnOrderItems,
    discount:      proportionalDiscount,
    paymentMethod: originalOrder.paymentMethod,
    isReturn:      true,
    originalOrder:  originalOrder._id,
    returnReason:  reason,
    refundMethod,
    notes,
  });
  // The pre-save hook recalculates totalAmount / totalProfit / finalAmount from items
  // so returnOrder.finalAmount === netRefund at this point ✓

  // 8. Stamp returnedQuantity on each original-order item and update returnStatus
  for (const { originalItem, returnQty } of computed) {
    originalItem.returnedQuantity = (originalItem.returnedQuantity || 0) + returnQty;
  }
  const fullyReturned = originalOrder.items.every(
    (item) => (item.returnedQuantity || 0) >= item.quantity,
  );
  originalOrder.returnStatus = fullyReturned ? "full" : "partial";
  await originalOrder.save();

  // 9. Reverse all stats in parallel
  await Promise.all([
    // Cashier: un-count the refunded revenue + profit
    User.findByIdAndUpdate(originalOrder.cashier, {
      $inc: { totalOrders: -netRefund, totalProfit: -netProfit },
    }),

    // Restaurant: un-count revenue + profit
    Restaurant.findByIdAndUpdate(originalOrder.restaurant, {
      $inc: { totalRevenue: -netRefund, totalProfit: -netProfit },
    }),

    // Per-meal: restore totalSold, totalRevenue, totalProfit
    ...computed.map(({ originalItem, returnQty, itemReturnTotal, itemReturnProfit }) =>
      Meal.findByIdAndUpdate(originalItem.meal, {
        $inc: {
          totalSold:    -returnQty,
          totalRevenue: -itemReturnTotal,
          totalProfit:  -itemReturnProfit,
        },
      }),
    ),

    // Client: reduce totalSpent
    ...(originalOrder.client
      ? [Client.findByIdAndUpdate(originalOrder.client, {
          $inc: { totalSpent: -netRefund },
        })]
      : []),
  ]);

  // 10. Pay-later debt adjustment
  // If the original order was on credit, the client's debt should shrink
  // by the refund amount (they no longer owe for the returned goods)
  if (originalOrder.paymentMethod === "later" && originalOrder.client) {
    const debt = await ClientDebt.findOne({
      order: originalOrder._id,
      status: { $ne: "paid" },
    });

    if (debt) {
      const currentRemaining = debt.currentAmount - debt.amountPaid;
      // Never reduce below what's already been paid
      const debtReduction = Math.min(netRefund, currentRemaining);

      if (debtReduction > 0) {
        debt.currentAmount -= debtReduction;
        if (debt.currentAmount <= debt.amountPaid) {
          debt.status = "paid";
        }
        debt.notes = [debt.notes, `Return ${returnOrder.orderNumber}: −${debtReduction}`]
          .filter(Boolean)
          .join(" | ");
        await debt.save();

        await Client.findByIdAndUpdate(originalOrder.client, {
          $inc: { totalDebt: -debtReduction },
        });
      }
    }
  }

  // 11. Activity log
  await logActivity({
    user:        req.user._id,
    restaurant:    originalOrder.restaurant,
    action:      "return",
    entityType:  "Order",
    entityId:    returnOrder._id,
    description: `Return ${returnOrder.orderNumber} from order ${originalOrder.orderNumber} — Refund: ${netRefund}`,
  });

  res.status(201).json({
    status: "success",
    data: {
      returnOrder,
      summary: {
        originalOrderNumber: originalOrder.orderNumber,
        originalOrderStatus: originalOrder.returnStatus,
        returnTotalAmount,
        proportionalDiscount,
        netRefund,
        netProfit,
        refundMethod,
      },
    },
  });
});
