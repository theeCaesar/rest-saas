const mongoose = require("mongoose");
const APIFeatures = require("./APIFeatures");
const AppError = require("./appError");
const catchAsync = require("./catchAsync");

exports.deleteOne = (Model, docName = "document") =>
  catchAsync(async (req, res, next) => {
    const id = req.params.id || req.params[`${docName}Id`];
    if (!id) {
      return next(new AppError(`Missing ${docName} ID`, 400));
    }
    const filter = { _id: id };
    if (req.restaurantScope) {
      filter.restaurant = req.restaurantScope;
    }
    const doc = await Model.findOneAndDelete(filter);
    if (!doc) {
      return next(new AppError(`${docName} not found`, 404));
    }
    res.status(204).json({
      status: "success",
      data: null,
    });
  });

exports.updateOne = (Model, docName = "document") =>
  catchAsync(async (req, res, next) => {
    const id = req.params.id || req.params[`${docName}Id`];
    if (!id) {
      return next(new AppError(`Missing ${docName} ID`, 400));
    }
    if (req.body.password || req.body.passwordConfirm) {
      return next(new AppError("Password updates are not allowed here", 400));
    }
    const filter = { _id: id };
    if (req.restaurantScope) {
      filter.restaurant = req.restaurantScope;
    }
    const doc = await Model.findOneAndUpdate(filter, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) {
      return next(new AppError(`${docName} not found`, 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        [docName]: doc,
      },
    });
  });

exports.createOne = (Model, docName = "document") =>
  catchAsync(async (req, res, next) => {
    if (req.restaurantScope && !req.body.restaurant) {
      req.body.restaurant = req.restaurantScope;
    }
    const newDoc = await Model.create(req.body);
    res.status(201).json({
      status: "success",
      data: {
        [docName]: newDoc,
      },
    });
  });

exports.getOne = (Model, populateOptions, docName = "document") =>
  catchAsync(async (req, res, next) => {
    const id = req.params.id || req.params[`${docName}Id`];
    if (!id) {
      return next(new AppError(`Missing ${docName} ID`, 400));
    }
    const filter = { _id: id };
    if (req.restaurantScope) {
      filter.restaurant = req.restaurantScope;
    }
    let query = Model.findOne(filter);
    if (populateOptions) {
      if (Array.isArray(populateOptions)) {
        populateOptions.forEach((opt) => {
          query = query.populate(opt);
        });
      } else {
        query = query.populate(populateOptions);
      }
    }
    const doc = await query.lean({ virtuals: true });
    if (!doc) {
      return next(new AppError(`${docName} not found`, 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        [docName]: doc,
      },
    });
  });

exports.getAll = (Model, docNamePlural = "documents", searchFields = ["name"], populateOptions = null) =>
  catchAsync(async (req, res, next) => {
    let filter = {};
    if (req.restaurantScope) {
      filter.restaurant = req.restaurantScope;
    }
    if (req.filterObj) {
      Object.assign(filter, req.filterObj);
    }
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q), "i");
      filter.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    delete req.query.q;

    const features = new APIFeatures(Model.find(filter), req.query)
      .filter()
      .sort()
      .selectFields()
      .paginate();

    let query = features.query;
    if (populateOptions) {
      const opts = Array.isArray(populateOptions) ? populateOptions : [populateOptions];
      opts.forEach((opt) => { query = query.populate(opt); });
    }

    const docs = await query.lean({ virtuals: true });
    const total = await Model.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: docs.length,
      total,
      data: {
        [docNamePlural]: docs,
      },
    });
  });
