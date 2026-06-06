class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludeFields = ["page", "sort", "limit", "fields", "q", "startDate", "endDate", "period", "populate"];
    excludeFields.forEach((el) => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(
      /\b(gte|gt|lte|lt|in|ne)\b/g,
      (match) => `$${match}`,
    );
    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  search(fields = ["name"]) {
    if (this.queryString.q) {
      const rx = new RegExp(String(this.queryString.q), "i");
      this.query = this.query.find({
        $or: fields.map((f) => ({ [f]: rx })),
      });
    }
    return this;
  }

  dateRange(field = "createdAt") {
    if (this.queryString.startDate || this.queryString.endDate) {
      const dateFilter = {};
      if (this.queryString.startDate) {
        dateFilter.$gte = new Date(this.queryString.startDate);
      }
      if (this.queryString.endDate) {
        dateFilter.$lte = new Date(this.queryString.endDate);
      }
      this.query = this.query.find({ [field]: dateFilter });
    }
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join(" ");
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort("-createdAt");
    }
    return this;
  }

  paginate() {
    const limit = Math.min(parseInt(this.queryString.limit, 10) || 10, 50);
    const page = parseInt(this.queryString.page, 10) || 1;
    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);
    return this;
  }

  selectFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",").join(" ");
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select("-__v");
    }
    return this;
  }
}

module.exports = APIFeatures;
