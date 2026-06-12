# RESTAURANT SAAS BACKEND — Extension Prompt (Night 2, HYBRID)

Adds the models behind the full dashboard feature set, using a **hybrid build strategy**:

- **BUILD FOR REAL** (cheap, genuinely useful, demos must be accurate): Reviews/Ratings, Analytics, Reports.
- **BUILD AS CONVINCING MOCK** (data models + REST + realistic seed data, but NO realtime infrastructure — these demo identically to "real" in a pitch, and the realtime plumbing is deferred to a post-contract Phase 2): Chat/Messaging, Live Driver Location.

For the mocked features you STILL build the full data model, REST endpoints, and rich seed data — they are fully functional via normal request/response and polling. What you DON'T build: Socket.IO, websockets, GPS streaming, push. Mark those with `// TODO Phase 2 (post-contract): realtime via Socket.IO`. The result looks complete in a demo; only continuous live-push is deferred.

**How to use:** open Claude Code in your `restaurant-saas` backend folder, paste this whole file. Runs in 6 phases. Don't stop between phases. When done, re-run the seed.

---

You are extending an existing multi-tenant restaurant operations backend (Node/Express/MongoDB). Existing models: activityLog, address, authLog, branch, cashier, category, client, clientDebt, debt, driver, employeeRecord, invoice, loss, meal, notification, order, plan, restaurant, section, stockOrder, subscriberMeal, subscription, supplier, task, ticket, transfer, user.

Tenancy: every model has a `restaurant` ref; `resolveTenant` middleware sets `req.restaurantId` from the `x-tenant` header; controllers filter by it. Routes mount under `/api/v1/*` in `app.js`. Follow the EXACT existing patterns — read `models/ticketModel.js` + its controller + routes as the reference, mirror its style, error handling, and tenant scoping.

Before writing, READ: `app.js` (route registration ~lines 126-155), the ticket model/controller/routes trio, `models/subscriberMealModel.js` (already has rating/reviewText), `middlewares/tenantMiddleware.js`, `scripts/seedDietFood.js`. Confirm one line, then start Phase 1. Work all 6 phases without stopping.

---

## PHASE 1 — Reviews & Ratings  [BUILD FOR REAL]

Fully functional. Real endpoints, real averages, used by both dashboard and customer site.

Create `models/reviewModel.js` — polymorphic review/rating covering meals, drivers, and customers:

```js
const reviewSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  author: { type: ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['customer','driver','admin','manager'], required: true },
  targetType: { type: String, enum: ['meal','driver','customer','order','subscription'], required: true, index: true },
  targetId: { type: ObjectId, required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true },
  isPublished: { type: Boolean, default: true },
  isFlagged: { type: Boolean, default: false },
  flagReason: String,
  order: { type: ObjectId, ref: 'Order' },
  subscriberMeal: { type: ObjectId, ref: 'SubscriberMeal' },
  response: { text: String, respondedBy: { type: ObjectId, ref: 'User' }, respondedAt: Date },
}, { timestamps: true });
reviewSchema.index({ restaurant: 1, targetType: 1, targetId: 1 });
reviewSchema.index({ restaurant: 1, isPublished: 1, createdAt: -1 });
```

Static `Review.recomputeAverage(targetType, targetId)` — recalculates avg + count and updates the denormalized field on the target:
- meal → `Meal.averageRating` + `Meal.totalRatings`
- driver → `Driver.averageRating` + `Driver.totalRatings` (add fields if missing)
- customer → `User.ratingAvg` + `User.ratingCount` (add if missing)
Call it in post-save + post-remove hooks.

Controller + routes (`/api/v1/reviews`):
- `GET /reviews?targetType=&targetId=` — list (published public)
- `GET /reviews/meal/:mealId`, `GET /reviews/driver/:driverId`
- `POST /reviews` — create (auth; authorRole from req.user.role)
- `PATCH /reviews/:id` — edit own / admin moderate
- `POST /reviews/:id/respond` — admin/manager
- `POST /reviews/:id/flag`
- `DELETE /reviews/:id` — author or admin
All tenant-scoped. Register `app.use("/api/v1/reviews", reviewRoutes);`.

Add `totalRatings: { type: Number, default: 0 }` to meal; `averageRating` + `totalRatings` to driver; `ratingAvg` + `ratingCount` to user.

Say "Phase 1 done — reviews/ratings (REAL)."

---

## PHASE 2 — Analytics  [BUILD FOR REAL]

Real aggregation pipelines — numbers must tie to actual seeded data so they survive scrutiny in a demo. No stored model; compute on demand.

`controllers/analyticsController.js` + `routes/analyticsRoutes.js`, all tenant-scoped, `$match { restaurant: req.restaurantId }` first in every pipeline:

- `GET /analytics/overview?from=&to=` — revenue, order count, active subs, new subs, churn, AOV, delivery completion rate
- `GET /analytics/employees?from=&to=` — per-employee performance: drivers (deliveries, on-time %, avg rating), cashiers (orders, sales, returns), kitchen (meals prepared from subscriberMeal status transitions). Returns `[{ user, role, metrics }]`
- `GET /analytics/employees/:userId?from=&to=` — one employee deep-dive: daily breakdown, trends, their reviews
- `GET /analytics/meals?from=&to=` — most/least ordered, highest/lowest rated, revenue per meal, by category
- `GET /analytics/subscriptions?from=&to=` — growth, churn, plan distribution, MRR, retention
- `GET /analytics/delivery?from=&to=` — avg delivery time, on-time %, by branch, by driver, by hour-of-day
- `GET /analytics/revenue?from=&to=&groupBy=day|week|month` — time series for charts

Default range = last 30 days. Register `app.use("/api/v1/analytics", analyticsRoutes);`.

Say "Phase 2 done — analytics (REAL)."

---

## PHASE 3 — Reports  [BUILD FOR REAL]

Nearly free once analytics exist. `models/reportModel.js`:

```js
const reportSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['sales','subscriptions','delivery','inventory','employee','financial','custom'], required: true },
  dateRange: { from: Date, to: Date },
  data: { type: mongoose.Schema.Types.Mixed },
  generatedBy: { type: ObjectId, ref: 'User' },
  notes: String,
}, { timestamps: true });
reportSchema.index({ restaurant: 1, type: 1, createdAt: -1 });
```

Routes (`/api/v1/reports`): list, get, `POST /reports/generate` (computes via Phase 2 aggregations, stores snapshot, returns it), delete. Admin/manager only for generate/delete. Register it.

Say "Phase 3 done — reports (REAL)."

---

## PHASE 4 — Chat / Messaging  [CONVINCING MOCK — data + REST only, NO realtime]

Build the FULL data model, REST endpoints, and rich seed data. It is fully usable via request/response + frontend polling. Do NOT add Socket.IO/websockets — mark those as deferred.

`models/conversationModel.js`:
```js
const conversationSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  type: { type: String, enum: ['customer_support','customer_driver','staff','order'], required: true },
  participants: [{ type: ObjectId, ref: 'User', required: true }],
  order: { type: ObjectId, ref: 'Order' },
  subscriberMeal: { type: ObjectId, ref: 'SubscriberMeal' },
  ticket: { type: ObjectId, ref: 'Ticket' },
  lastMessage: { text: String, sender: { type: ObjectId, ref: 'User' }, sentAt: Date },
  lastMessageAt: { type: Date, index: true },
  unread: [{ user: { type: ObjectId, ref: 'User' }, count: { type: Number, default: 0 } }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
conversationSchema.index({ restaurant: 1, participants: 1, lastMessageAt: -1 });
```

`models/messageModel.js`:
```js
const messageSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  conversation: { type: ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: ObjectId, ref: 'User', required: true },
  senderRole: String,
  content: { type: String, required: true },
  attachments: [String],
  readBy: [{ user: { type: ObjectId, ref: 'User' }, readAt: Date }],
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });
messageSchema.index({ conversation: 1, createdAt: 1 });
```

Routes (`/api/v1/conversations`): my conversations; messages in a conversation (paginated, marks read); start conversation; send message (updates lastMessage/lastMessageAt, increments others' unread); mark read. Participant-guarded, tenant-scoped.

At the top of the message controller add: `// TODO Phase 2 (post-contract): realtime push via Socket.IO. For now frontend polls.` Do not build any websocket code.

Register `app.use("/api/v1/conversations", conversationRoutes);`.

Say "Phase 4 done — chat (mock: full data + REST, polling, no realtime)."

---

## PHASE 5 — Live Driver Location  [CONVINCING MOCK — data + REST only, NO GPS/realtime]

Build the data model + REST endpoints + seed positions. The map will read current positions and poll. Do NOT build GPS streaming or websocket push.

`models/driverLocationModel.js`:
```js
const driverLocationSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
  driver: { type: ObjectId, ref: 'Driver', required: true, index: true },
  location: { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  heading: Number,
  speed: Number,
  status: { type: String, enum: ['idle','on_delivery','returning','offline'], default: 'idle' },
  activeDeliveries: [{ type: ObjectId, ref: 'SubscriberMeal' }],
  updatedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });
driverLocationSchema.index({ restaurant: 1, driver: 1 }, { unique: true });
```

Routes (`/api/v1/driver-locations`): list all current (for the map); one driver; `POST /update` (upsert by driver; driver role). Add `// TODO Phase 2 (post-contract): driver app sends real GPS + Socket.IO broadcast. For now positions are set via seed/manual update and the map polls.`

Register it.

Say "Phase 5 done — live location (mock: data + REST + polling, no GPS)."

---

## PHASE 6 — Permissions + extend seed

### Permissions
Ensure user role enum: `super_admin, admin, manager, kitchen, dispatcher, cashier, driver, customer`. If a `restrictTo(...roles)` middleware exists, apply: reviews create=any authed, moderate/respond=admin/manager; conversations=participants only; driver-locations update=driver, read=admin/manager/dispatcher; analytics+reports=admin/manager. If none exists, add a simple `restrictTo` in `middlewares/authMiddleware.js` and apply to those.

### Extend `scripts/seedDietFood.js` (idempotent — clear + reseed for dietfood tenant)
- **~80 Reviews** across meals (most), some driver ratings, a few customer ratings. Realistic Arabic comments ("وجبة لذيذة وصحية", "التوصيل سريع", "السعرات دقيقة وحسيت بالفرق", "كمية ممتازة"). Weighted to 4-5 stars, a few 3s. Call recomputeAverage after.
- **~10 Conversations + messages**: customer_support, customer_driver, staff threads. 3-6 Arabic messages each. Set lastMessage/unread so the chat list looks alive.
- **Driver locations**: one per driver around Baghdad (lat ~33.31, lng ~44.40 ± 0.05), mixed statuses, activeDeliveries linked to today's dispatched subscriberMeals — so the map looks populated.
- **~5 Reports**: one per main type with recent range + computed snapshot.

### Final
Register all new routes in app.js. Mentally verify `require('./app.js')` loads (no missing imports). Update README endpoint list.

Say "Phase 6 done." Then summary:
1. New models (mark REAL vs MOCK)
2. New routes (method + path)
3. New seed counts
4. TODOs deferred to post-contract Phase 2 (Socket.IO chat push, GPS live tracking)
5. Re-seed command

---

## FINAL
If genuine ambiguity, stop and ask. Otherwise execute all 6 phases. Read the reference files, confirm one line, start Phase 1.
