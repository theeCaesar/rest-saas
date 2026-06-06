const mongoose = require('mongoose');
const slugify = require('slugify');

const mealSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
  name: { type: String, required: true, trim: true },          // Arabic primary
  nameEn: { type: String, trim: true },
  slug: { type: String, lowercase: true, index: true },
  description: { type: String, trim: true },
  descriptionEn: { type: String, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },

  price: { type: Number, required: true, min: 0 },             // IQD
  image: String,
  images: [String],

  // Nutrition
  calories: { type: Number, min: 0 },
  protein_g: { type: Number, min: 0 },
  carbs_g: { type: Number, min: 0 },
  fat_g: { type: Number, min: 0 },
  fiber_g: { type: Number, min: 0 },

  // Filters and discovery
  dietary_tags: [{
    type: String,
    enum: ['keto', 'vegan', 'vegetarian', 'gluten-free', 'low-carb', 'high-protein', 'dairy-free', 'sugar-free']
  }],
  allergens: [{
    type: String,
    enum: ['gluten', 'dairy', 'nuts', 'eggs', 'soy', 'fish', 'shellfish']
  }],
  spicyLevel: { type: Number, min: 0, max: 3, default: 0 },

  // Operations
  isAvailable: { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false },
  preparationTime: { type: Number, default: 15 },             // minutes

  // Plan eligibility (which subscription plans this meal qualifies for)
  eligibleForPlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],

  // Display
  sortOrder: { type: Number, default: 0 },

  // Stats (denormalized for fast queries)
  averageRating: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

mealSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

mealSchema.index({ restaurant: 1, category: 1, isAvailable: 1 });
mealSchema.index({ restaurant: 1, dietary_tags: 1 });
mealSchema.index({ name: 'text', nameEn: 'text', description: 'text' });

module.exports = mongoose.model('Meal', mealSchema);
