# RESTAURANT SAAS BACKEND — Full Conversion Prompt

Paste everything below this line into Claude Code in your `restaurant-saas` folder. Hit enter. Let it work. Review the summary it gives you at the end before deploying.

---

You are converting this Node.js/Express/MongoDB backend from a single-tenant pharmacy management system into a multi-tenant restaurant operations platform called **restaurant-saas**. The first tenant will be a diet food restaurant in Baghdad called "Diet Food" with two branches. The platform must be designed so additional restaurants can be added later as separate tenants without code changes — just config and seed data.

Before you start any work, read `app.js`, `server.js`, all files in `models/`, all files in `routes/`, and all files in `controllers/` so you understand the codebase. Then read `_loya_reference/Plan.js`, `_loya_reference/Subscription.js`, and `_loya_reference/Invoice.js` because we'll be grafting those in. Confirm you've read them before proceeding.

Execute the work in seven phases. After each phase, write one line summarizing what you did and continue to the next phase. Do not stop for confirmation between phases. At the end, give me a final summary.

---

## PHASE 1 — Global rename: pharmacy domain → restaurant domain

Across the entire codebase (every `.js` file in models, routes, controllers, middlewares, utils, validators, app.js, server.js), perform these exact renames. Update file names, file contents, import/require paths, mongoose model registration names, route paths, controller function names, schema field names, and string references. Be thorough — leftover "pharmacy" references will break tenant resolution later.

Renames (case-sensitive, replace whole words only — don't break things like "pharmaceutical" if any exist, but in this codebase they shouldn't):

- `Pharmacy` → `Restaurant`
- `pharmacy` → `restaurant`
- `pharmacies` → `restaurants`
- `DeliveryMan` → `Driver`
- `deliveryMan` → `driver`
- `deliveryMen` → `drivers`
- `Product` → `Meal`
- `product` → `meal` (be careful: only in domain context, not generic words)
- `products` → `meals`
- `Sale` → `Order`
- `sale` → `order` (same care: only domain context — keep words like "sort by")
- `sales` → `orders`
- `Salesman` → `Cashier`
- `salesman` → `cashier`
- `salesmen` → `cashiers`
- `InventoryOrder` → `StockOrder` (to disambiguate from customer Order)
- `inventoryOrder` → `stockOrder`
- `DoctorOrder` → DELETE the model, routes, controller entirely (not applicable to restaurants)

Preserve all business logic, validation rules, indexes, hooks, and middlewares. Only rename. Do not touch anything in `_loya_reference/`.

Special handling for `productModel.js` → `mealModel.js`: keep the file as-is for now (rename only). We adapt its schema in Phase 4.

When done, run `grep -r "pharmacy\|Pharmacy\|deliveryMan\|DeliveryMan" --include="*.js" --exclude-dir=node_modules --exclude-dir=_loya_reference .` and report any remaining references. Fix them. Then say "Phase 1 done."

---

## PHASE 2 — Add multi-tenant resolution middleware

Create a new file `middlewares/tenantMiddleware.js` with the following exports:

**`resolveTenant(req, res, next)`**:
1. Determine tenant slug, in this priority order:
   - `req.headers['x-tenant']` (used in development and for API tools)
   - Subdomain from `req.headers.host` (e.g., `dietfood.example.com` → `dietfood`); ignore subdomains that equal `www`, `api`, `admin`, or `localhost`
2. If no slug resolved, respond `400` with `{ status: 'fail', message: 'Tenant not specified' }`.
3. Look up `Restaurant.findOne({ slug: slug.toLowerCase(), isActive: true })`.
4. If not found: `404` with `{ status: 'fail', message: 'Restaurant not found' }`.
5. On success: `req.restaurantId = restaurant._id; req.restaurant = restaurant; next();`

**`requireSameTenant(req, res, next)`**:
- Assumes `req.user` exists (used after `protect` middleware).
- Reads `req.user.restaurant` (the user's tenant) and compares to `req.restaurantId`.
- If `req.user.role === 'super_admin'`, skip the check (super-admins manage all tenants).
- Mismatch → respond `403` with `{ status: 'fail', message: 'Access denied: wrong tenant' }`.
- Match → `next()`.

**`scopeQueryToTenant(req, res, next)`**:
- Sets `req.tenantFilter = { restaurant: req.restaurantId }`.
- Controllers can merge this filter into their queries: `Model.find({ ...req.tenantFilter, ...otherFilters })`.

Then modify `app.js`:
1. Apply `resolveTenant` middleware to all routes that start with `/api/v1/` EXCEPT:
   - `/api/v1/auth/login`
   - `/api/v1/auth/register` (if exists; if not, skip)
   - `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password`
   - `/api/v1/public/*` (we'll add public landing endpoints later)
   - `/api/v1/super-admin/*` (cross-tenant admin)
   - `/health`
2. After tenant resolution + auth middleware run, apply `requireSameTenant` on protected routes.
3. Add a `/health` endpoint that returns `{ status: 'ok', timestamp: new Date(), version: '1.0.0' }`.

Update `models/restaurantModel.js` (was pharmacy):
- Add field `slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/, index: true }`.
- Add field `isActive: { type: Boolean, default: true, index: true }`.
- Add field `branding: { primaryColor: String, secondaryColor: String, accentColor: String, logoUrl: String, faviconUrl: String }`.
- Add field `contactInfo: { customerServicePhone: String, email: String, website: String }`.
- Add field `defaultCurrency: { type: String, default: 'IQD' }`.
- Add field `defaultLanguage: { type: String, default: 'ar', enum: ['ar', 'en'] }`.
- Keep all existing fields.

Update `models/userModel.js`:
- Ensure it has a `restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true }` field. If the pharmacy version had `pharmacy`, the rename in Phase 1 handled it — just verify.
- Add `'super_admin'` to the role enum if not present.
- Add `'driver'`, `'kitchen'`, `'dispatcher'`, `'customer'` to the role enum.
- Roles must include at minimum: `super_admin, admin, manager, kitchen, dispatcher, cashier, driver, customer`.

Say "Phase 2 done."

---

## PHASE 3 — Graft the better subscription system from loya

The existing pharmacy `subscriptionModel.js` is a one-subscription-per-tenant model — it's wrong for Diet Food, which needs many subscribers per restaurant with proper recurring billing.

Replace it with loya's three-model system (Plan + Subscription + Invoice). Read these three reference files first:
- `_loya_reference/Plan.js`
- `_loya_reference/Subscription.js`
- `_loya_reference/Invoice.js`

Then:

**Create `models/planModel.js`** based on loya's Plan.js with these adaptations:
- Replace any `project` references with `restaurant` (`ObjectId, ref: 'Restaurant', required, index`).
- Keep loya's `name: Map of String` (localized — ar/en).
- Keep `description: Map of String`.
- Add restaurant-specific fields:
  - `mealCount: { type: Number, required: true }` (meals per day: 1, 2, or 3)
  - `includesBreakfast: { type: Boolean, default: false }`
  - `includesFriday: { type: Boolean, default: true }` (Iraq weekend is Friday)
  - `billingPeriod: { type: String, enum: ['weekly', 'monthly'], required: true }`
  - `originalPrice: Number` (pre-discount, e.g., 175000)
  - `discountedPrice: Number` (post-discount, e.g., 160000)
  - `discountPercentage: { type: Number, default: 0 }`
  - `dietaryFocus: [{ type: String, enum: ['standard', 'keto', 'low-carb', 'high-protein', 'vegetarian', 'vegan'] }]`
- Keep `currency` (default 'IQD'), `isActive`, `isFeatured`, `sortOrder`.

**Create `models/subscriptionModel.js`** by REPLACING the existing one. Based on loya's Subscription.js but adapted:
- Replace `project` references with `restaurant` (required).
- Keep `owner` field as `user: ObjectId ref User` (the subscriber).
- Keep `plan: ObjectId ref Plan`.
- Keep `status: enum` from loya's constants, ensure values include: `pending, active, paused, cancelled, expired`.
- Keep `billingCycle, startDate, endDate, autoRenew, assignedBy`.
- Add restaurant-specific:
  - `deliveryAddress: { type: ObjectId, ref: 'Address' }` (default delivery for this subscription)
  - `preferredBranch: { type: ObjectId, ref: 'Branch' }` (optional — auto-assign by location otherwise)
  - `dietaryNotes: String` (allergies, preferences)
  - `pausedAt: Date`
  - `pausedReason: String`
  - `resumeOnDate: Date` (auto-resume scheduling)
  - `mealsRemaining: Number` (for prepaid plans — counts down)
  - `mealsConsumedTotal: { type: Number, default: 0 }`
- Keep all virtual fields from loya (invoices virtual, daysRemaining, isExpired).
- Indexes: `(restaurant, status)`, `(user, status)`, `(endDate)`, `(nextPaymentDate)`.

**Create `models/invoiceModel.js`** based on loya's Invoice.js:
- Add `restaurant: ObjectId ref Restaurant` (required, indexed).
- Keep `subscription` and `owner` fields (rename owner → user if needed).
- Keep all amount, status, paidAt, dueDate fields.
- Add `paymentMethod: { type: String, enum: ['cash', 'zaincash', 'qicard', 'fib', 'bank_transfer', 'other'] }`.
- Add `paymentReference: String` (transaction ID from the provider).

**Create the constants file** at `constants/subscription.js`:
```js
exports.SUBSCRIPTION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};
exports.BILLING_CYCLE = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
};
exports.INVOICE_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
};
```

**Create routes + controllers** for plans, subscriptions, and invoices:
- `routes/planRoutes.js` + `controllers/planController.js`: CRUD on plans, all tenant-scoped. GET endpoints public-readable (customers browse plans before subscribing).
- `routes/subscriptionRoutes.js` + `controllers/subscriptionController.js`: CRUD + special actions: `POST /:id/pause`, `POST /:id/resume`, `POST /:id/cancel`, `GET /me` (current user's active subscription).
- `routes/invoiceRoutes.js` + `controllers/invoiceController.js`: list invoices, get invoice, mark paid (admin/cashier only).

Wire all three new route files into `app.js` under `/api/v1/plans`, `/api/v1/subscriptions`, `/api/v1/invoices`.

Delete the old `_loya_reference/` folder when this phase is done.

Say "Phase 3 done."

---

## PHASE 4 — Adapt the Meal model for restaurant needs

Replace the contents of `models/mealModel.js` (which was renamed from productModel.js in Phase 1). Drop all pharmacy-specific complexity — variants, batch numbers, expire dates, suppliers, recommended piece prices. A meal is much simpler than a pharmaceutical product.

New schema:

```javascript
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
```

Update `controllers/mealController.js` (was productController) to:
- Apply `req.tenantFilter` to all queries (so meals from one restaurant are isolated).
- Support filtering by: category, dietary_tags (multiple), isAvailable, min/max calories, min protein, text search.
- Support sorting by: name, price asc/desc, calories asc/desc, protein desc, totalOrders desc, newest.
- Pagination via `?page=1&limit=20`.

Update `routes/mealRoutes.js`:
- `GET /api/v1/meals` (public — customers browse)
- `GET /api/v1/meals/:id` (public)
- `POST /api/v1/meals` (admin/manager only)
- `PATCH /api/v1/meals/:id` (admin/manager only)
- `DELETE /api/v1/meals/:id` (admin only)

Adapt the Order model (was Sale) in `models/orderModel.js`:
- Drop `expireDate`, `batchNumber`, `piecesPerPack` from line items.
- Add to order schema:
  - `restaurant: ObjectId ref` (required, indexed)
  - `branch: ObjectId ref Branch` (which branch fulfills this)
  - `customer: ObjectId ref User`
  - `deliveryAddress: { type: ObjectId, ref: 'Address' }`
  - `deliveryLocation: { lat: Number, lng: Number, label: String }` (snapshot in case address is later deleted)
  - `subscription: ObjectId ref Subscription` (null if one-off order)
  - `assignedDriver: ObjectId ref Driver`
  - `status: { type: String, enum: ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'], default: 'pending', index: true }`
  - `paymentMethod: enum ['cash', 'zaincash', 'qicard', 'fib', 'bank_transfer']`
  - `paymentStatus: enum ['pending', 'paid', 'refunded'], default: 'pending'`
  - `customerNotes: String`
  - `kitchenNotes: String`
  - `dispatchedAt`, `deliveredAt`, `estimatedDeliveryTime`

Say "Phase 4 done."

---

## PHASE 5 — Create the four new models

Create these new models, each with controller and routes. All tenant-scoped via `req.tenantFilter`.

### `models/branchModel.js`
```javascript
const branchSchema = new Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  name: { type: String, required: true },      // Arabic
  nameEn: String,
  slug: { type: String, lowercase: true },
  address: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  phones: [String],
  openingHours: { open: String, close: String, days: [String] },
  managerId: { type: ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
branchSchema.index({ restaurant: 1, isActive: 1 });
```

### `models/addressModel.js`
```javascript
const addressSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, required: true },       // "البيت", "العمل"
  fullAddress: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  buildingDetails: String,                       // "Building 5, apt 3"
  deliveryInstructions: String,
  contactPhone: String,
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });
```

Pre-save hook: if `isDefault` is true on a new save, unset `isDefault` on the user's other addresses.

### `models/subscriberMealModel.js`
This is the daily-meal-per-subscriber tracking — the core of the operational dashboard.
```javascript
const subscriberMealSchema = new Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  subscription: { type: ObjectId, ref: 'Subscription', required: true, index: true },
  user: { type: ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true, index: true },
  mealNumber: { type: Number, default: 1 },    // 1, 2, or 3 (for multi-meal plans)
  meal: { type: ObjectId, ref: 'Meal' },
  branch: { type: ObjectId, ref: 'Branch' },
  deliveryAddress: { type: ObjectId, ref: 'Address' },
  driver: { type: ObjectId, ref: 'Driver' },
  status: { 
    type: String, 
    enum: ['scheduled', 'preparing', 'ready', 'dispatched', 'delivered', 'skipped', 'cancelled'],
    default: 'scheduled',
    index: true,
  },
  scheduledTime: Date,
  preparedAt: Date,
  dispatchedAt: Date,
  deliveredAt: Date,
  customerNotes: String,
  rating: { type: Number, min: 1, max: 5 },
  reviewText: String,
}, { timestamps: true });
subscriberMealSchema.index({ restaurant: 1, date: 1, status: 1 });
subscriberMealSchema.index({ subscription: 1, date: 1 });
```

### `models/ticketModel.js`
```javascript
const ticketSchema = new Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  user: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['complaint', 'request', 'dietary', 'delivery', 'billing', 'other'], required: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  messages: [{
    author: { type: ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    attachments: [String],
    createdAt: { type: Date, default: Date.now },
  }],
  assignedTo: { type: ObjectId, ref: 'User' },
  resolvedAt: Date,
}, { timestamps: true });
```

For each model, create a corresponding controller + routes file with standard CRUD endpoints, all tenant-scoped. Wire them into `app.js`.

Special endpoints:
- `GET /api/v1/subscriber-meals/today` — returns today's meals for the tenant (the dashboard hero query). Optionally filtered by `?status=` and `?branch=`.
- `PATCH /api/v1/subscriber-meals/:id/status` — staff transition status (preparing → ready → dispatched → delivered).
- `POST /api/v1/tickets/:id/messages` — add a message to a ticket thread.

Say "Phase 5 done."

---

## PHASE 6 — Seed script with full Diet Food data

Create `scripts/seedDietFood.js`. It must be idempotent — running it twice should produce the same state. Drop existing Diet Food data first, then insert fresh.

Requirements:

```javascript
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Restaurant = require('../models/restaurantModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Driver = require('../models/driverModel');
const Plan = require('../models/planModel');
const Category = require('../models/categoryModel');
const Meal = require('../models/mealModel');
const Address = require('../models/addressModel');
const Subscription = require('../models/subscriptionModel');
const SubscriberMeal = require('../models/subscriberMealModel');
const Order = require('../models/orderModel');

// ... full seed code below ...
```

**Step 1 — Connect to MongoDB**, then look up restaurant by slug 'dietfood' and if it exists, delete the restaurant + cascade delete all dependent docs (users, drivers, plans, categories, meals, subscriptions, addresses, subscriberMeals, orders, tickets where restaurant === this id).

**Step 2 — Create the Restaurant tenant:**
```javascript
{
  name: 'Diet Food',
  nameAr: 'دايت فود',
  slug: 'dietfood',
  tagline: 'اول مطعم دايت في العراق - 10 سنوات خبرة',
  isActive: true,
  branding: { primaryColor: '#1B5E20', secondaryColor: '#2E7D32', accentColor: '#F4C842', logoUrl: '/logos/dietfood.png' },
  contactInfo: { customerServicePhone: '07754441322', email: 'info@dietfood.iq', website: 'https://dietfood.iq' },
  defaultCurrency: 'IQD',
  defaultLanguage: 'ar',
}
```

**Step 3 — Create 2 Branches:**
- Karrada: `{ name: 'فرع الكرادة', nameEn: 'Karrada Branch', address: 'الكرادة - ساحة الوائق - شارع 42 - قرب شركة ميتسوبيشي', location: { lat: 33.3036, lng: 44.4395 }, phones: ['07831742858', '07737511125', '07804008010'], openingHours: { open: '10:00', close: '23:00', days: ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'] }, isActive: true }`
- Mansour: `{ name: 'فرع المنصور', nameEn: 'Mansour Branch', address: 'المنصور - شارع أبو جعفر المنصور - مقابل دائرة الجوازات', location: { lat: 33.3169, lng: 44.3543 }, phones: ['07711228411', '07721411998', '07814384490'], openingHours: { open: '10:00', close: '23:00', days: ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'] }, isActive: true }`

**Step 4 — Create 8 Plans** with these exact values:
```javascript
const plans = [
  { name: { ar: 'اشتراك أسبوعي - وجبة واحدة (مع الجمعة)', en: 'Weekly 1 Meal (with Friday)' },
    mealCount: 1, includesBreakfast: false, includesFriday: true, billingPeriod: 'weekly',
    originalPrice: 175000, discountedPrice: 160000, discountPercentage: 10, priceMonthly: 160000 },
  { name: { ar: 'اشتراك أسبوعي - وجبة واحدة (بدون الجمعة)', en: 'Weekly 1 Meal (no Friday)' },
    mealCount: 1, includesBreakfast: false, includesFriday: false, billingPeriod: 'weekly',
    originalPrice: 155000, discountedPrice: 140000, discountPercentage: 10, priceMonthly: 140000 },
  { name: { ar: 'اشتراك أسبوعي - وجبتين (مع الجمعة)', en: 'Weekly 2 Meals (with Friday)' },
    mealCount: 2, includesBreakfast: false, includesFriday: true, billingPeriod: 'weekly',
    originalPrice: 355000, discountedPrice: 323000, discountPercentage: 10, priceMonthly: 323000 },
  { name: { ar: 'اشتراك أسبوعي - 3 وجبات (مع الجمعة)', en: 'Weekly 3 Meals (with Friday)' },
    mealCount: 3, includesBreakfast: false, includesFriday: true, billingPeriod: 'weekly',
    originalPrice: 535000, discountedPrice: 480000, discountPercentage: 10, priceMonthly: 480000, isFeatured: true },
  { name: { ar: 'اشتراك شهري - وجبة واحدة (مع الجمعة)', en: 'Monthly 1 Meal (with Friday)' },
    mealCount: 1, includesBreakfast: false, includesFriday: true, billingPeriod: 'monthly',
    originalPrice: 185000, discountedPrice: 185000, discountPercentage: 0, priceMonthly: 185000 },
  { name: { ar: 'اشتراك شهري - وجبتين في اليوم', en: 'Monthly 2 Meals' },
    mealCount: 2, includesBreakfast: false, includesFriday: true, billingPeriod: 'monthly',
    originalPrice: 355000, discountedPrice: 295000, discountPercentage: 17, priceMonthly: 295000, isFeatured: true },
  { name: { ar: 'اشتراك شهري - 3 وجبات', en: 'Monthly 3 Meals' },
    mealCount: 3, includesBreakfast: false, includesFriday: true, billingPeriod: 'monthly',
    originalPrice: 510000, discountedPrice: 430000, discountPercentage: 16, priceMonthly: 430000 },
  { name: { ar: 'اشتراك فطور', en: 'Breakfast Pack' },
    mealCount: 1, includesBreakfast: true, includesFriday: true, billingPeriod: 'weekly',
    originalPrice: 30000, discountedPrice: 25000, discountPercentage: 17, priceMonthly: 25000 },
];
```
All linked to the Diet Food restaurant, all with `currency: 'IQD'`, `isActive: true`, `dietaryFocus: ['standard']` except keto/vegan variants.

**Step 5 — Create 13 Categories:**
```javascript
const categories = [
  { slug: 'sandwiches', name: 'السندويجات', nameEn: 'Sandwiches', sortOrder: 1 },
  { slug: 'meat', name: 'وجبات اللحم', nameEn: 'Meat Dishes', sortOrder: 2 },
  { slug: 'chicken', name: 'وجبات الدجاج', nameEn: 'Chicken Dishes', sortOrder: 3 },
  { slug: 'fish', name: 'وجبات السمك', nameEn: 'Fish Dishes', sortOrder: 4 },
  { slug: 'pasta', name: 'وجبات المعكرونة', nameEn: 'Pasta', sortOrder: 5 },
  { slug: 'kumpir', name: 'الكومبير', nameEn: 'Kumpir', sortOrder: 6 },
  { slug: 'salads', name: 'السلطات', nameEn: 'Salads', sortOrder: 7 },
  { slug: 'breakfast', name: 'الفطور', nameEn: 'Breakfast', sortOrder: 8 },
  { slug: 'keto', name: 'وجبات الكيتو دايت', nameEn: 'Keto Meals', sortOrder: 9 },
  { slug: 'vegetarian', name: 'الوجبات النباتية', nameEn: 'Vegetarian', sortOrder: 10 },
  { slug: 'juices', name: 'العصائر', nameEn: 'Juices', sortOrder: 11 },
  { slug: 'soups', name: 'الحساء', nameEn: 'Soups', sortOrder: 12 },
  { slug: 'saj', name: 'الصاج', nameEn: 'Saj Wraps', sortOrder: 13 },
];
```
All linked to Diet Food restaurant.

**Step 6 — Create 105 Meals from this inline array** (do not require an external CSV; embed it in the script). Each meal: `{ name, category_slug, price, calories, protein }`. Compute `carbs_g = Math.round(calories * 0.4 / 4)`, `fat_g = Math.round(calories * 0.3 / 9)`, `fiber_g = Math.round(calories / 100)`. Auto-assign dietary_tags by category:
- `keto` category → `['keto', 'low-carb', 'high-protein']`
- `vegetarian` → `['vegetarian']`
- `salads` → `['vegetarian', 'low-carb']`
- `chicken`/`meat`/`fish` → `['high-protein']` (auto-add `gluten-free` if protein > 35g)
- `juices`/`soups` → `['low-carb']` if protein ≤ 5
- everything else → empty array

Use this meal data (paste it inline as a JS array in the seed script):

```
سندويج هميركر لحم|sandwiches|6000|480|28
سندويج هميركر لحم بالجبن|sandwiches|6500|530|32
سندويج هميركر دجاج|sandwiches|5000|420|26
سندويج هميركر دجاج بالجبن|sandwiches|5500|470|30
سندويج هميركر لحم دايت فود|sandwiches|9000|510|35
سندويج بوكر لحم دايت فود|sandwiches|8000|480|33
سندويج بوكر لحم بالجبن|sandwiches|7000|520|35
سندويج بوكر لحم باربيكيو|sandwiches|7000|530|34
سندويج بوكر كلاسك|sandwiches|6000|460|28
سندويج ميني بوكر دجاج|sandwiches|5000|380|24
سندويج فاهيتا دجاج|sandwiches|6000|420|26
سندويج ستيك لحم|sandwiches|8000|540|38
سندويج ستيك دجاج|sandwiches|7000|470|32
سندويج شيش طاووق|sandwiches|7000|450|33
سندويج فرانسيسكو|sandwiches|7000|490|30
سندويج موصح|sandwiches|5000|410|24
سندويج دجاج هندي|sandwiches|6000|440|28
سندويج فلاديلفيا لحم بالجبن|sandwiches|8000|560|36
سندويج شاورما دجاج|sandwiches|6000|430|29
وجبة لحم مشوي|meat|11000|620|48
وجبة لحم مشوي بصلصة الفطر|meat|11000|660|48
وجبة لحم مشوي بالليمون|meat|11000|610|47
وجبة لحم مشوي بالفلفل سبايسي|meat|11000|640|48
وجبة لحم مشوي بصلصة الباربيكيو|meat|11000|670|48
وجبة كفتة لحم|meat|11000|590|42
فيلادلفيا لحم مع فلفل ألوان وفطر|meat|11000|680|45
كاري لحم|meat|11000|640|44
بيف ستراكانوف|meat|12000|690|46
وجبة ملفوف الباذنجان|meat|12000|580|36
كباب بالطريقة الهندية|meat|9000|600|42
كباب اسكندر|meat|10000|620|44
عرايس لحم|meat|11000|540|38
بيف كولاش|meat|12000|650|44
كفتة بالبطاطا|meat|11000|610|40
كفتة بالخضار|meat|11000|530|38
كفتة بالطحينية|meat|11000|570|40
ستيك لحم سويسري|meat|11000|620|46
ستيك لحم مكسيكي|meat|11000|640|46
وجبة دجاج الكاري|chicken|8000|540|44
ستيك دجاج|chicken|8000|480|46
صدر دجاج محشي بالخضار|chicken|9000|460|48
وجبة فاهيتا دجاج|chicken|7000|510|38
وجبة شيش طاووق|chicken|7000|490|42
وجبة بيكاتا دجاج|chicken|8000|530|44
وجبة دجاج صيني بالخضار|chicken|8000|480|40
نودلز بالدجاج والخضار|chicken|8000|510|36
وجبة عرايس دجاج دايت|chicken|8000|460|36
كاسادايا دجاج|chicken|8000|520|38
وجبة الدجاج بالترياكي|chicken|8000|540|40
وجبة دجاج بالصلصة الحمراء سبايسي|chicken|9000|530|42
بريانتو دجاج|chicken|9000|590|38
دجاج الكيف|chicken|9000|470|44
دجاج كرنان|chicken|8000|460|42
برياني دجاج|chicken|9000|600|38
كبسة دجاج|chicken|9000|580|40
كفتة دجاج بالخضار|chicken|8000|460|38
كباب دجاج|chicken|9000|510|44
وجبة شاورما دجاج|chicken|8000|480|36
وجبة ايمانسيه دجاج|chicken|8000|530|38
كروكيت دجاج|chicken|8000|470|32
معجوقة دجاج|chicken|8000|460|34
دجاج بصلصة الفريدو|chicken|8000|540|36
دجاج بالسبانخ|chicken|8000|470|38
دجاج سويت اند سور|chicken|8000|520|36
سمك فيلية|fish|8000|380|36
زبيدي مشوي بالخضار|fish|14000|420|42
وجبة روبيان ميني|fish|11000|360|28
وجبة سمك السلمون|fish|16000|480|44
روبيان دايت فود|fish|14000|380|32
مطبق روبيان|fish|8000|400|28
سمك الكاري|fish|9000|430|36
فوتشيني دايت|pasta|7000|490|22
باستا ايطالية|pasta|6000|470|18
سباكيتي بولونيز|pasta|6000|520|26
سباكيتي ميلانيز|pasta|7000|510|22
باستا ايطالية بصلصة الفريدو|pasta|7000|540|24
باستا دجاج الكاجون|pasta|7000|530|32
سباكيتي البيستو|pasta|8000|550|24
كومبير لحم|kumpir|6000|480|28
كومبير دجاج|kumpir|6000|460|30
كومبير خضار|kumpir|6000|380|14
بطاطا مشوية|kumpir|4000|280|6
فرايز بطاطا باللحم|kumpir|6000|540|24
تشيلي فرايز|kumpir|7000|580|22
سلطة سيزر دايت|salads|7000|280|18
سلطة جرجير|salads|4000|180|6
سلطة تونة دايت|salads|6000|320|28
سلطة لهانة|salads|4000|140|4
تبولة|salads|5000|220|6
سلطة يونانية|salads|5000|260|8
سلطة الكينوا|salads|6000|340|12
سلطة فواكه|salads|7000|240|4
سلطة الافوكادو|salads|8000|380|8
سلطة الافوكادو بالتونة|salads|9000|440|28
سلطة فول|salads|5000|280|14
سلطة الشيف|salads|8000|320|22
أوملت بيض كلاسيك|breakfast|6000|320|22
أوملت لحم|breakfast|6000|420|28
أوملت خضار|breakfast|6000|260|16
أوملت فطر|breakfast|6000|280|18
أوملت جبن لايت|breakfast|6000|340|24
طبق بيض مسلوق مع الجرجير|breakfast|6000|240|18
بان كيك دايت بالشوفان|breakfast|6000|320|14
أوملت زعتر بالجبن|breakfast|6000|320|22
دجاج مسحب بالحامض والثوم والفطر|keto|10000|380|46
شيش طاووق كيتو|keto|8000|360|44
ستيكة دجاج إيطالي|keto|10000|420|48
دجاج مفرمش|keto|9000|440|42
كوردن بلو كيتو|keto|10000|480|46
كفتة لحم كيتو|keto|12000|520|44
شرائح لحم كيتو|keto|11000|540|48
ستيك لحم باللحم المفروم|keto|12000|580|50
زبيدي كيتو|keto|15000|460|44
فيلية سمك كيتو|keto|10000|380|40
سلمون كيتو|keto|16000|520|46
بطاطا مع بزاليا بصلصة الطماطم|vegetarian|7000|320|8
مسقعة باذنجان|vegetarian|7000|280|6
خضار مشوي|vegetarian|6000|220|5
كبسة رز بالخضار|vegetarian|6000|380|8
وجبة سباغيتي صحية|vegetarian|7000|420|12
كفتة نباتية|vegetarian|8000|340|14
كاسادايا البطاطا|vegetarian|7000|380|8
عصير برتقال طبيعي بدون سكر|juices|3000|110|2
عصير ليمون طبيعي بدون سكر|juices|3000|60|0
عصير موز حليب خالي الدسم بدون سكر|juices|4000|180|8
عصير تفاح طبيعي بدون سكر|juices|4000|120|0
عصير جزر طبيعي بدون سكر|juices|4000|95|2
عصير ليمون - برتقال|juices|4000|100|1
حساء خمار|soups|3000|140|8
حساء دجاج|soups|3000|180|14
حساء حارق للدهون بالسبانخ|soups|3000|90|6
شوربة عدس حمراء|soups|3000|220|12
صاج دجاج|saj|6000|420|28
صاج لحم|saj|8000|480|32
صاج ايطالي دجاج|saj|7000|460|28
صاج ايطالي لحم|saj|8000|510|32
صاج عربي|saj|8000|470|28
```

**Step 7 — Create 5 staff users**, all with password "password123" bcrypt-hashed:
- `admin@dietfood.iq` (role: admin, name: 'مدير النظام')
- `kitchen@dietfood.iq` (role: kitchen, name: 'إدارة المطبخ')
- `dispatcher@dietfood.iq` (role: dispatcher, name: 'تنسيق التوصيل')
- `cashier@dietfood.iq` (role: cashier, name: 'الكاشير')
- `manager@dietfood.iq` (role: manager, name: 'مدير العمليات')

Plus 3 Drivers (linked Driver records + corresponding driver-role User accounts):
- `driver1@dietfood.iq` (سائق الكرادة 1)
- `driver2@dietfood.iq` (سائق الكرادة 2)
- `driver3@dietfood.iq` (سائق المنصور 1)
All with password "password123".

**Step 8 — Create 30 customer users + their addresses + active subscriptions.**

Use these Arabic first names + last names (mix and match for 30 customers):
First: أحمد، علي، حسين، محمد، عمر، يوسف، عبدالله، حسن، كريم، خالد، فاطمة، زينب، مريم، نور، آلاء، رنا، هدى، سارة، دينا، ليلى
Last: العبيدي، الجبوري، الكاظمي، الحسيني، الموسوي، الكربلائي، البغدادي، الدليمي، التميمي، السامرائي

Email pattern: `customer1@example.com`, `customer2@example.com`, ... password "password123".

For each customer:
- 1-2 saved addresses in Baghdad (random lat/lng around 33.30, 44.40, varying by ±0.05)
- 70% active subscription distribution:
  - 30% on monthly 1-meal (185k)
  - 25% on monthly 2-meals (295k) 
  - 15% on weekly 3-meals (480k)
  - 20% on monthly 3-meals (430k)
  - 10% on weekly 1-meal (160k)
- 30% have status `paused` or `expired` to show realistic data
- Each active sub: random `dietaryNotes` (e.g., "بدون فلفل حار", "حساسية من المكسرات", "نباتي يأكل البيض")
- `startDate` between 1-60 days ago, `endDate` extends from there

**Step 9 — Create today's SubscriberMeal records** for every active subscriber based on their plan's mealCount:
- mealNumber 1 (lunch ~13:00) for everyone
- mealNumber 2 (dinner ~19:00) for plans with mealCount >= 2  
- mealNumber 3 (breakfast ~09:00) for plans with mealCount === 3
- Random meal from a category that fits the customer's preference
- Random branch (auto-assign by lat/lng proximity)
- Random driver from that branch
- Status distribution today (for a realistic dashboard):
  - 20% delivered, 25% ready, 35% preparing, 20% scheduled
- Assigned driver only for `ready`/`dispatched`/`delivered`

**Step 10 — Create ~50 historical Orders** scattered over the last 30 days for variety (mix of subscription-linked and one-off), various statuses, both branches.

**Step 11 — Log progress** at each step (e.g., "Created 105 meals across 13 categories"). At the end, log a summary table:
```
Restaurant: Diet Food (slug: dietfood)
Branches: 2
Plans: 8
Categories: 13
Meals: 105
Staff: 5
Drivers: 3
Customers: 30
Active subscriptions: ~21
Today's subscriber meals: ~35
Historical orders: ~50
```

Close the connection cleanly with `mongoose.connection.close()`.

Make the script runnable with `node scripts/seedDietFood.js` from the project root.

Say "Phase 6 done."

---

## PHASE 7 — Deployment configuration

**Create `render.yaml`** in the project root:
```yaml
services:
  - type: web
    name: restaurant-saas-api
    runtime: node
    region: frankfurt
    plan: starter
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: JWT_EXPIRES_IN
        value: 90d
      - key: PORT
        value: 8080
    healthCheckPath: /health
```

**Update `server.js`** to use `process.env.PORT || 5000`.

**Update CORS config** in `app.js`. Use `cors` package with this whitelist:
```javascript
const allowedOrigins = [
  /^https:\/\/.*\.yourdomain\.io$/,        // any subdomain of your platform domain
  /^https:\/\/.*\.onrender\.com$/,          // Render preview deploys
  /^https:\/\/.*\.vercel\.app$/,            // Vercel deploys for frontend
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const ok = allowedOrigins.some(o => o instanceof RegExp ? o.test(origin) : o === origin);
    callback(ok ? null : new Error('CORS blocked'), ok);
  },
  credentials: true,
  exposedHeaders: ['x-tenant'],
}));
```

(I'll replace `yourdomain.io` with my actual domain later — leave it as a TODO comment.)

**Create `.env.example`** showing required vars:
```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=replace-me
JWT_EXPIRES_IN=90d
```

**Update `package.json` scripts**:
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "seed:dietfood": "node scripts/seedDietFood.js"
  }
}
```

**Create `README.md`** at the project root with:
1. Project name + 2-sentence description
2. Stack (Node, Express, MongoDB, JWT)
3. Setup: clone, npm install, copy .env.example to config.env, set MONGODB_URI + JWT_SECRET
4. Seed: `npm run seed:dietfood`
5. Run dev: `npm run dev`
6. API base: `http://localhost:5000/api/v1`
7. Multi-tenant note: pass `x-tenant: dietfood` header on all requests, OR access via subdomain in production
8. Test login: `POST /api/v1/auth/login` with `{ email: "admin@dietfood.iq", password: "password123" }` and header `x-tenant: dietfood`

Say "Phase 7 done."

---

## FINAL — Summary

After all phases complete, produce a single markdown summary that includes:
1. Number of files renamed in Phase 1
2. New middlewares added
3. Models added/modified/deleted
4. Routes registered (list with method + path)
5. Anything you noticed needs human attention (broken imports, ambiguous renames, etc.)
6. The exact command to run the seed script
7. The exact command to start the server

If you hit any genuine ambiguity (not just a missing detail — a real fork in the road), stop and ask. Otherwise, work through all seven phases without pausing.

Begin Phase 1.
