const mongoose = require("mongoose");
const StockOrder = require("../models/stockOrderModel");
const Meal = require("../models/mealModel");
const Supplier = require("../models/supplierModel");
const Cashier = require("../models/cashierModel");
const Debt = require("../models/debtModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { logActivity } = require("../utils/activityLogger");

exports.createStockOrder = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;
  req.body.createdBy = req.user._id;

  // auto-create cashier if new
  if (req.body.cashierName && !req.body.cashier) {
    let cashier = await Cashier.findOne({
      name: req.body.cashierName,
      restaurant: req.body.restaurant,
    });
    if (!cashier) {
      cashier = await Cashier.create({
        name: req.body.cashierName,
        phone: req.body.cashierPhone || "",
        supplier: req.body.supplier,
        restaurant: req.body.restaurant,
      });
    }
    req.body.cashier = cashier._id;
  }

  // calc item prices
  if (req.body.items) {
    req.body.items = req.body.items.map((item) => {
      const totalItemPrice = item.unitPrice * item.quantity;
      const totalUnits = item.quantity + (item.freeBonus || 0);
      const calculatedOriginalPrice = totalUnits > 0 ? totalItemPrice / totalUnits : item.unitPrice;
      const discountPercentage = item.freeBonus > 0 ? ((item.freeBonus / totalUnits) * 100) : 0;
      return {
        ...item,
        totalItemPrice,
        calculatedOriginalPrice,
        discountPercentage,
      };
    });
  }

  const order = await StockOrder.create(req.body);

  // create debt record
  if (order.paymentDueDate) {
    try {
      await Debt.create({
        restaurant: order.restaurant,
        stockOrder: order._id,
        supplier: order.supplier,
        originalAmount: order.totalOrderPrice,
        currentAmount: (order.adjustedTotalPrice || order.totalOrderPrice) - (order.amountPaid || 0),
        dueDate: new Date(order.paymentDueDate),
        penaltyRate: order.latePenaltyPerDay || 0,
        status: order.amountPaid > 0 ? "partial" : "pending",
      });
    } catch (debtErr) {
      console.error(`Failed to create debt for order ${order._id}:`, debtErr.message);
    }
  }

  // update supplier stats
  await Supplier.findByIdAndUpdate(order.supplier, {
    $inc: { totalOrders: 1, totalDebt: order.totalOrderPrice },
  });

  await logActivity({
    user: req.user._id,
    restaurant: req.body.restaurant,
    action: "inventory_order",
    entityType: "StockOrder",
    entityId: order._id,
    description: `Created inventory order ${order.orderNumber}`,
  });

  res.status(201).json({
    status: "success",
    data: { stockOrder: order },
  });
});

exports.receiveOrder = catchAsync(async (req, res, next) => {
  const order = await StockOrder.findById(req.params.id);
  if (!order) return next(new AppError("Inventory order not found", 404));

  const driver = req.body.driverId || req.body.driver;
  const itemUpdates = req.body.itemUpdates || req.body.itemStatuses || [];
  if (driver) order.driver = driver;

  for (const update of itemUpdates) {
    const item = order.items.id(update.itemId);
    if (!item) continue;

    const meal = item.meal ? await Meal.findById(item.meal) : null;
    const variantBase = meal ? {
      stockOrder: order._id,
      supplier: order.supplier,
      originalPrice: item.calculatedOriginalPrice,
      recommendedSellingPrice: item.recommendedSellingPrice || meal.recommendedSellingPrice,
      recommendedPiecePrice: item.recommendedPiecePrice || meal.recommendedPiecePrice,
      expireDate: item.expireDate,
      batchNumber: item.batchNumber,
      piecesPerPack: item.piecesPerPack || meal.piecesPerPack,
      freeBonus: item.freeBonus,
      discountPercentage: item.discountPercentage,
      driver: driver,
      deliveredAt: new Date(),
    } : null;

    // --- receive main quantity ---
    if (update.receiveMain && item.mainStatus === "pending") {
      item.mainStatus = "delivered";
      item.deliveredAt = update.deliveredAt ? new Date(update.deliveredAt) : new Date();
      if (meal) {
        meal.variants.push({ ...variantBase, quantityInStock: item.quantity });
        await meal.save();
      }
    }

    // --- receive bonus quantity (independent) ---
    if (update.receiveBonus && item.bonusStatus === "pending" && item.freeBonus > 0) {
      item.bonusStatus = "delivered";
      item.bonusDeliveredAt = update.bonusDeliveredAt
        ? new Date(update.bonusDeliveredAt)
        : new Date();
      if (meal) {
        meal.variants.push({ ...variantBase, quantityInStock: item.freeBonus });
        await meal.save();
      }
    }

    // --- cancel item ---
    if (update.cancel) {
      item.mainStatus = "cancelled";
      if (item.bonusStatus === "pending") item.bonusStatus = "cancelled";
    }
  }

  // An item is fully settled when main is done AND bonus is done (or not applicable)
  const isSettled = (i) =>
    (i.mainStatus === "delivered" || i.mainStatus === "cancelled") &&
    (i.bonusStatus === "delivered" || i.bonusStatus === "not_applicable" || i.bonusStatus === "cancelled");

  const allSettled = order.items.every(isSettled);
  const someDelivered = order.items.some(
    (i) => i.mainStatus === "delivered" || i.bonusStatus === "delivered",
  );

  if (allSettled) {
    order.status = "delivered";
  } else if (someDelivered) {
    order.status = "partial_delivery";
  }

  await order.save();

  await logActivity({
    user: req.user._id,
    restaurant: order.restaurant,
    action: "inventory_order",
    entityType: "StockOrder",
    entityId: order._id,
    description: `Received inventory order ${order.orderNumber}`,
  });

  res.status(200).json({
    status: "success",
    data: { stockOrder: order },
  });
});

exports.makePayment = catchAsync(async (req, res, next) => {
  const order = await StockOrder.findById(req.params.id);
  if (!order) return next(new AppError("Inventory order not found", 404));

  const { amount, method, notes } = req.body;
  if (!amount || amount <= 0) {
    return next(new AppError("Payment amount must be positive", 400));
  }

  order.amountPaid = (order.amountPaid || 0) + amount;
  if (order.amountPaid >= order.adjustedTotalPrice) {
    order.paymentStatus = "paid";
    order.paidAt = new Date();
  } else {
    order.paymentStatus = "partial";
  }
  await order.save();

  // update debt
  const debt = await Debt.findOne({ stockOrder: order._id });
  if (debt) {
    debt.amountPaid = (debt.amountPaid || 0) + amount;
    debt.payments.push({ amount, method, notes, paidAt: new Date() });
    if (debt.amountPaid >= debt.currentAmount) {
      debt.status = "paid";
    } else {
      debt.status = "partial";
    }
    await debt.save();
  }

  // update supplier debt
  await Supplier.findByIdAndUpdate(order.supplier, {
    $inc: { totalDebt: -amount },
  });

  await logActivity({
    user: req.user._id,
    restaurant: order.restaurant,
    action: "payment",
    entityType: "StockOrder",
    entityId: order._id,
    description: `Payment of ${amount} on order ${order.orderNumber}`,
  });

  res.status(200).json({
    status: "success",
    data: { stockOrder: order },
  });
});

exports.getAllStockOrders = factory.getAll(StockOrder, "stockOrders", ["orderNumber"]);
exports.getStockOrder = factory.getOne(
  StockOrder,
  [
    { path: "supplier", select: "name phone" },
    { path: "cashier", select: "name phone" },
    { path: "driver", select: "name phone" },
    { path: "createdBy", select: "name" },
    { path: "items.meal", select: "name barcode" },
  ],
  "stockOrder",
);
exports.updateStockOrder = factory.updateOne(StockOrder, "stockOrder");
exports.deleteStockOrder = factory.deleteOne(StockOrder, "stockOrder");
