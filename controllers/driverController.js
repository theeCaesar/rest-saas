const Driver = require("../models/driverModel");
const factory = require("../utils/handlerFactory");

exports.createDriver = factory.createOne(Driver, "driver");
exports.getAllDrivers = factory.getAll(Driver, "drivers", ["name", "phone"]);
exports.getDriver = factory.getOne(Driver, null, "driver");
exports.updateDriver = factory.updateOne(Driver, "driver");
exports.deleteDriver = factory.deleteOne(Driver, "driver");
