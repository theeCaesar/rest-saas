const Meal = require("../models/mealModel");
const Notification = require("../models/notificationModel");
const StockOrder = require("../models/stockOrderModel");
const Debt = require("../models/debtModel");

exports.checkExpiryNotifications = async () => {
  try {
    const meals = await Meal.find({ isActive: true, "variants.isActive": true });

    for (const meal of meals) {
      for (const daysBefore of meal.expiryNotificationDays || [30, 60, 180]) {
        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() + daysBefore);

        for (const variant of meal.variants) {
          if (!variant.isActive || !variant.expireDate) continue;
          if (variant.expireDate <= warningDate) {
            const existing = await Notification.findOne({
              restaurant: meal.restaurant,
              meal: meal._id,
              type: "expiry_warning",
              daysUntilExpiry: daysBefore,
              "relatedEntity": variant._id,
            });
            if (!existing) {
              const daysLeft = Math.ceil(
                (variant.expireDate - new Date()) / (1000 * 60 * 60 * 24),
              );
              let severity = "low";
              if (daysLeft <= 7) severity = "critical";
              else if (daysLeft <= 30) severity = "high";
              else if (daysLeft <= 60) severity = "medium";

              await Notification.create({
                restaurant: meal.restaurant,
                type: "expiry_warning",
                title: `Meal expiring: ${meal.name}`,
                message: `${meal.name} (Batch: ${variant.batchNumber || "N/A"}) expires in ${daysLeft} days on ${variant.expireDate.toISOString().split("T")[0]}. Stock: ${variant.quantityInStock}`,
                meal: meal._id,
                relatedEntity: variant._id,
                relatedEntityType: "MealVariant",
                severity,
                daysUntilExpiry: daysBefore,
                expiresAt: variant.expireDate,
              });
            }
          }
        }
      }

      if (meal.totalQuantityInStock <= meal.minimumStock) {
        const existing = await Notification.findOne({
          restaurant: meal.restaurant,
          meal: meal._id,
          type: "low_stock",
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });
        if (!existing) {
          await Notification.create({
            restaurant: meal.restaurant,
            type: "low_stock",
            title: `Low stock: ${meal.name}`,
            message: `${meal.name} has ${meal.totalQuantityInStock} units remaining. Minimum stock level is ${meal.minimumStock}.`,
            meal: meal._id,
            severity: meal.totalQuantityInStock === 0 ? "critical" : "high",
          });
        }
      }
    }
    console.log("Expiry and stock notifications checked");
  } catch (err) {
    console.error("Notification check error:", err.message);
  }
};

exports.checkPaymentDueNotifications = async () => {
  try {
    const debts = await Debt.find({
      status: { $in: ["pending", "partial"] },
    }).populate("supplier");

    for (const debt of debts) {
      const daysUntilDue = Math.ceil(
        (debt.dueDate - new Date()) / (1000 * 60 * 60 * 24),
      );
      const isOverdue = daysUntilDue < 0;

      if (isOverdue || daysUntilDue <= 7) {
        const type = isOverdue ? "payment_overdue" : "payment_due";
        const existing = await Notification.findOne({
          restaurant: debt.restaurant,
          type,
          relatedEntity: debt._id,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });

        if (!existing) {
          await Notification.create({
            restaurant: debt.restaurant,
            type,
            title: isOverdue
              ? `Payment overdue: ${debt.supplier?.name || "Supplier"}`
              : `Payment due soon: ${debt.supplier?.name || "Supplier"}`,
            message: isOverdue
              ? `Payment of ${debt.remainingAmount} is ${Math.abs(daysUntilDue)} days overdue`
              : `Payment of ${debt.remainingAmount} is due in ${daysUntilDue} days`,
            stockOrder: debt.stockOrder,
            relatedEntity: debt._id,
            relatedEntityType: "Debt",
            severity: isOverdue ? "critical" : "high",
          });
        }
      }
    }
    console.log("Payment notifications checked");
  } catch (err) {
    console.error("Payment notification check error:", err.message);
  }
};

exports.applyLatePenalties = async () => {
  try {
    const overdueOrders = await StockOrder.find({
      paymentStatus: { $ne: "paid" },
      paymentDueDate: { $lt: new Date() },
      latePenaltyPerDay: { $gt: 0 },
    });

    for (const order of overdueOrders) {
      const overdueDays = Math.floor(
        (Date.now() - order.paymentDueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const penalty = overdueDays * order.latePenaltyPerDay;
      order.latePenaltyApplied = penalty;
      order.adjustedTotalPrice = order.totalOrderPrice + penalty;
      await order.save();
      await Debt.findOneAndUpdate(
        { stockOrder: order._id },
        { currentAmount: order.adjustedTotalPrice, totalPenalty: penalty },
      );
    }
    console.log("Late penalties applied");
  } catch (err) {
    console.error("Late penalty error:", err.message);
  }
};
