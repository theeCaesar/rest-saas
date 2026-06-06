const ActivityLog = require("../models/activityLogModel");

exports.logActivity = async ({
  user,
  restaurant,
  action,
  entityType,
  entityId,
  description,
  changes,
  metadata,
}) => {
  try {
    await ActivityLog.create({
      user,
      restaurant,
      action,
      entityType,
      entityId,
      description,
      changes,
      metadata,
    });
  } catch (err) {
    console.error("Activity log error:", err.message);
  }
};
