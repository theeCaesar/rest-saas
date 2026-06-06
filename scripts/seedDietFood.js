/* eslint-disable no-console */
require("dotenv").config({ path: "./config.env" });
const mongoose = require("mongoose");
// Passwords are hashed by the User model's pre-save hook; bcrypt kept for ref.
const bcrypt = require("bcryptjs"); // eslint-disable-line no-unused-vars

const Restaurant = require("../models/restaurantModel");
const Branch = require("../models/branchModel");
const User = require("../models/userModel");
const Driver = require("../models/driverModel");
const Plan = require("../models/planModel");
const Category = require("../models/categoryModel");
const Meal = require("../models/mealModel");
const Address = require("../models/addressModel");
const Subscription = require("../models/subscriptionModel");
const SubscriberMeal = require("../models/subscriberMealModel");
const Order = require("../models/orderModel");
const Ticket = require("../models/ticketModel");
const Invoice = require("../models/invoiceModel");

const DB = process.env.MONGO_URI || process.env.MONGODB_URI;
const PASSWORD = "password123";

// ─── helpers ────────────────────────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

function weightedPick(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of pairs) {
    if ((r -= w) <= 0) return value;
  }
  return pairs[0][0];
}

function babylonLocation() {
  return { lat: +rand(33.25, 33.35).toFixed(6), lng: +rand(44.35, 44.45).toFixed(6) };
}

// ─── meal source data (name|category_slug|price|calories|protein) ─────────────
const MEAL_DATA = `سندويج هميركر لحم|sandwiches|6000|480|28
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
صاج عربي|saj|8000|470|28`;

function dietaryTagsFor(categorySlug, protein) {
  switch (categorySlug) {
    case "keto":
      return ["keto", "low-carb", "high-protein"];
    case "vegetarian":
      return ["vegetarian"];
    case "salads":
      return ["vegetarian", "low-carb"];
    case "chicken":
    case "meat":
    case "fish": {
      const tags = ["high-protein"];
      if (protein > 35) tags.push("gluten-free");
      return tags;
    }
    case "juices":
    case "soups":
      return protein <= 5 ? ["low-carb"] : [];
    default:
      return [];
  }
}

const DIETARY_NOTES = [
  "بدون فلفل حار",
  "حساسية من المكسرات",
  "نباتي يأكل البيض",
  "بدون بصل",
  "قليل الملح",
  "بدون منتجات الألبان",
  "حساسية من الجلوتين",
];

const FIRST_NAMES = [
  "أحمد", "علي", "حسين", "محمد", "عمر", "يوسف", "عبدالله", "حسن", "كريم",
  "خالد", "فاطمة", "زينب", "مريم", "نور", "آلاء", "رنا", "هدى", "سارة",
  "دينا", "ليلى",
];
const LAST_NAMES = [
  "العبيدي", "الجبوري", "الكاظمي", "الحسيني", "الموسوي", "الكربلائي",
  "البغدادي", "الدليمي", "التميمي", "السامرائي",
];

async function run() {
  if (!DB) throw new Error("MONGO_URI is not set in config.env");
  await mongoose.connect(DB);
  console.log("Connected to MongoDB");

  // ── Guard: never seed a protected / production database ───────────────────
  // The pharmacy production data lives in `al-mada`. Refuse to run against it
  // (or any NODE_ENV=production DB) unless explicitly forced.
  const SEED_DB_DENYLIST = ["al-mada"];
  const dbName = mongoose.connection.name;
  if (
    (SEED_DB_DENYLIST.includes(dbName) || process.env.NODE_ENV === "production") &&
    process.env.ALLOW_PROD_SEED !== "true"
  ) {
    console.error(
      `Refusing to seed protected/production database "${dbName}". ` +
        `Point MONGO_URI at a dev database, or set ALLOW_PROD_SEED=true to override.`,
    );
    await mongoose.connection.close();
    process.exit(1);
  }

  // ── Step 0: drop stale indexes left over from the pharmacy schema ─────────
  // The old subscription model had a unique index on `owner`; the new model
  // uses `user`, so every new doc would collide on owner:null. Drop any such
  // legacy indexes (ignore if they don't exist).
  const staleIndexes = [["subscriptions", "owner_1"], ["subscriptions", "project_1"]];
  for (const [coll, idx] of staleIndexes) {
    try {
      await mongoose.connection.collection(coll).dropIndex(idx);
      console.log(`Dropped stale index ${coll}.${idx}`);
    } catch (_) {
      /* index not present — fine */
    }
  }

  // ── Step 1: idempotent cleanup ──────────────────────────────────────────
  const existing = await Restaurant.findOne({ slug: "dietfood" });
  if (existing) {
    const rid = existing._id;
    const userIds = await User.find({ restaurant: rid }).distinct("_id");
    await Promise.all([
      Address.deleteMany({ user: { $in: userIds } }),
      SubscriberMeal.deleteMany({ restaurant: rid }),
      Subscription.deleteMany({ restaurant: rid }),
      Invoice.deleteMany({ restaurant: rid }),
      Order.deleteMany({ restaurant: rid }),
      Ticket.deleteMany({ restaurant: rid }),
      Meal.deleteMany({ restaurant: rid }),
      Category.deleteMany({ restaurant: rid }),
      Plan.deleteMany({ restaurant: rid }),
      Driver.deleteMany({ restaurant: rid }),
      Branch.deleteMany({ restaurant: rid }),
    ]);
    await User.deleteMany({ restaurant: rid });
    await Restaurant.deleteOne({ _id: rid });
    console.log("Removed existing Diet Food data");
  }

  // ── Step 2: restaurant tenant ────────────────────────────────────────────
  const restaurant = new Restaurant({
    name: "Diet Food",
    nameAr: "دايت فود",
    slug: "dietfood",
    tagline: "اول مطعم دايت في العراق - 10 سنوات خبرة",
    isActive: true,
    branding: {
      primaryColor: "#1B5E20",
      secondaryColor: "#2E7D32",
      accentColor: "#F4C842",
      logoUrl: "/logos/dietfood.png",
    },
    contactInfo: {
      customerServicePhone: "07754441322",
      email: "info@dietfood.iq",
      website: "https://dietfood.iq",
    },
    defaultCurrency: "IQD",
    defaultLanguage: "ar",
  });
  // owner is required but the admin user does not exist yet (chicken & egg).
  await restaurant.save({ validateBeforeSave: false });
  const rid = restaurant._id;
  console.log("Created restaurant: Diet Food");

  // ── Step 3: branches ──────────────────────────────────────────────────────
  const branches = await Branch.create([
    {
      restaurant: rid,
      name: "فرع الكرادة",
      nameEn: "Karrada Branch",
      address: "الكرادة - ساحة الوائق - شارع 42 - قرب شركة ميتسوبيشي",
      location: { lat: 33.3036, lng: 44.4395 },
      phones: ["07831742858", "07737511125", "07804008010"],
      openingHours: {
        open: "10:00",
        close: "23:00",
        days: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      },
      isActive: true,
    },
    {
      restaurant: rid,
      name: "فرع المنصور",
      nameEn: "Mansour Branch",
      address: "المنصور - شارع أبو جعفر المنصور - مقابل دائرة الجوازات",
      location: { lat: 33.3169, lng: 44.3543 },
      phones: ["07711228411", "07721411998", "07814384490"],
      openingHours: {
        open: "10:00",
        close: "23:00",
        days: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      },
      isActive: true,
    },
  ]);
  const karrada = branches[0];
  const mansour = branches[1];
  console.log(`Created ${branches.length} branches`);

  // ── Step 4: plans ─────────────────────────────────────────────────────────
  const planDefs = [
    { ref: "weekly1Fri", name: { ar: "اشتراك أسبوعي - وجبة واحدة (مع الجمعة)", en: "Weekly 1 Meal (with Friday)" }, mealCount: 1, includesBreakfast: false, includesFriday: true, billingPeriod: "weekly", originalPrice: 175000, discountedPrice: 160000, discountPercentage: 10, priceMonthly: 160000 },
    { ref: "weekly1NoFri", name: { ar: "اشتراك أسبوعي - وجبة واحدة (بدون الجمعة)", en: "Weekly 1 Meal (no Friday)" }, mealCount: 1, includesBreakfast: false, includesFriday: false, billingPeriod: "weekly", originalPrice: 155000, discountedPrice: 140000, discountPercentage: 10, priceMonthly: 140000 },
    { ref: "weekly2Fri", name: { ar: "اشتراك أسبوعي - وجبتين (مع الجمعة)", en: "Weekly 2 Meals (with Friday)" }, mealCount: 2, includesBreakfast: false, includesFriday: true, billingPeriod: "weekly", originalPrice: 355000, discountedPrice: 323000, discountPercentage: 10, priceMonthly: 323000 },
    { ref: "weekly3Fri", name: { ar: "اشتراك أسبوعي - 3 وجبات (مع الجمعة)", en: "Weekly 3 Meals (with Friday)" }, mealCount: 3, includesBreakfast: false, includesFriday: true, billingPeriod: "weekly", originalPrice: 535000, discountedPrice: 480000, discountPercentage: 10, priceMonthly: 480000, isFeatured: true },
    { ref: "monthly1Fri", name: { ar: "اشتراك شهري - وجبة واحدة (مع الجمعة)", en: "Monthly 1 Meal (with Friday)" }, mealCount: 1, includesBreakfast: false, includesFriday: true, billingPeriod: "monthly", originalPrice: 185000, discountedPrice: 185000, discountPercentage: 0, priceMonthly: 185000 },
    { ref: "monthly2", name: { ar: "اشتراك شهري - وجبتين في اليوم", en: "Monthly 2 Meals" }, mealCount: 2, includesBreakfast: false, includesFriday: true, billingPeriod: "monthly", originalPrice: 355000, discountedPrice: 295000, discountPercentage: 17, priceMonthly: 295000, isFeatured: true },
    { ref: "monthly3", name: { ar: "اشتراك شهري - 3 وجبات", en: "Monthly 3 Meals" }, mealCount: 3, includesBreakfast: false, includesFriday: true, billingPeriod: "monthly", originalPrice: 510000, discountedPrice: 430000, discountPercentage: 16, priceMonthly: 430000 },
    { ref: "breakfast", name: { ar: "اشتراك فطور", en: "Breakfast Pack" }, mealCount: 1, includesBreakfast: true, includesFriday: true, billingPeriod: "weekly", originalPrice: 30000, discountedPrice: 25000, discountPercentage: 17, priceMonthly: 25000 },
  ];
  const planByRef = {};
  let sortOrder = 0;
  for (const def of planDefs) {
    const { ref, ...rest } = def;
    const plan = await Plan.create({
      ...rest,
      restaurant: rid,
      currency: "IQD",
      isActive: true,
      dietaryFocus: ["standard"],
      sortOrder: sortOrder++,
    });
    planByRef[ref] = plan;
  }
  console.log(`Created ${planDefs.length} plans`);

  // ── Step 5: categories ──────────────────────────────────────────────────
  const categoryDefs = [
    { slug: "sandwiches", name: "السندويجات", nameEn: "Sandwiches", sortOrder: 1 },
    { slug: "meat", name: "وجبات اللحم", nameEn: "Meat Dishes", sortOrder: 2 },
    { slug: "chicken", name: "وجبات الدجاج", nameEn: "Chicken Dishes", sortOrder: 3 },
    { slug: "fish", name: "وجبات السمك", nameEn: "Fish Dishes", sortOrder: 4 },
    { slug: "pasta", name: "وجبات المعكرونة", nameEn: "Pasta", sortOrder: 5 },
    { slug: "kumpir", name: "الكومبير", nameEn: "Kumpir", sortOrder: 6 },
    { slug: "salads", name: "السلطات", nameEn: "Salads", sortOrder: 7 },
    { slug: "breakfast", name: "الفطور", nameEn: "Breakfast", sortOrder: 8 },
    { slug: "keto", name: "وجبات الكيتو دايت", nameEn: "Keto Meals", sortOrder: 9 },
    { slug: "vegetarian", name: "الوجبات النباتية", nameEn: "Vegetarian", sortOrder: 10 },
    { slug: "juices", name: "العصائر", nameEn: "Juices", sortOrder: 11 },
    { slug: "soups", name: "الحساء", nameEn: "Soups", sortOrder: 12 },
    { slug: "saj", name: "الصاج", nameEn: "Saj Wraps", sortOrder: 13 },
  ];
  const categoryBySlug = {};
  for (const def of categoryDefs) {
    const cat = await Category.create({ ...def, restaurant: rid });
    categoryBySlug[def.slug] = cat;
  }
  console.log(`Created ${categoryDefs.length} categories`);

  // ── Step 6: meals ──────────────────────────────────────────────────────────
  const mealDocs = [];
  let mealSort = 0;
  for (const line of MEAL_DATA.split("\n")) {
    const [name, categorySlug, priceStr, calStr, proteinStr] = line.split("|");
    const price = Number(priceStr);
    const calories = Number(calStr);
    const protein = Number(proteinStr);
    const category = categoryBySlug[categorySlug];
    mealDocs.push({
      restaurant: rid,
      name: name.trim(),
      category: category._id,
      price,
      calories,
      protein_g: protein,
      carbs_g: Math.round((calories * 0.4) / 4),
      fat_g: Math.round((calories * 0.3) / 9),
      fiber_g: Math.round(calories / 100),
      dietary_tags: dietaryTagsFor(categorySlug, protein),
      isAvailable: true,
      sortOrder: mealSort++,
    });
  }
  const meals = await Meal.create(mealDocs);
  const mealsByCategory = {};
  for (const m of meals) {
    const slug = Object.keys(categoryBySlug).find(
      (s) => String(categoryBySlug[s]._id) === String(m.category),
    );
    (mealsByCategory[slug] = mealsByCategory[slug] || []).push(m);
  }
  console.log(`Created ${meals.length} meals across ${categoryDefs.length} categories`);

  // ── Step 7: staff + drivers ────────────────────────────────────────────────
  const admin = await User.create({
    name: "مدير النظام",
    email: "admin@dietfood.iq",
    password: PASSWORD,
    role: "admin",
    restaurant: rid,
  });
  // Now the restaurant has a valid owner.
  restaurant.owner = admin._id;
  await restaurant.save();

  const staffDefs = [
    { name: "إدارة المطبخ", email: "kitchen@dietfood.iq", role: "kitchen" },
    { name: "تنسيق التوصيل", email: "dispatcher@dietfood.iq", role: "dispatcher" },
    { name: "الكاشير", email: "cashier@dietfood.iq", role: "cashier" },
    { name: "مدير العمليات", email: "manager@dietfood.iq", role: "manager" },
  ];
  for (const s of staffDefs) {
    await User.create({ ...s, password: PASSWORD, restaurant: rid });
  }
  console.log(`Created ${staffDefs.length + 1} staff users`);

  const driverDefs = [
    { name: "سائق الكرادة 1", email: "driver1@dietfood.iq", branch: karrada },
    { name: "سائق الكرادة 2", email: "driver2@dietfood.iq", branch: karrada },
    { name: "سائق المنصور 1", email: "driver3@dietfood.iq", branch: mansour },
  ];
  const driversByBranch = { [karrada._id]: [], [mansour._id]: [] };
  for (let i = 0; i < driverDefs.length; i++) {
    const d = driverDefs[i];
    const driver = await Driver.create({
      restaurant: rid,
      name: d.name,
      phone: `0770000000${i + 1}`,
    });
    await User.create({
      name: d.name,
      email: d.email,
      password: PASSWORD,
      role: "driver",
      restaurant: rid,
    });
    driversByBranch[d.branch._id].push(driver);
  }
  console.log(`Created ${driverDefs.length} drivers`);

  // ── Step 8: customers + addresses + subscriptions ──────────────────────────
  const planDistribution = [
    [planByRef.monthly1Fri, 30],
    [planByRef.monthly2, 25],
    [planByRef.weekly3Fri, 15],
    [planByRef.monthly3, 20],
    [planByRef.weekly1Fri, 10],
  ];

  const customers = [];
  const activeSubscriptions = []; // { sub, plan, user, address }
  for (let i = 1; i <= 30; i++) {
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const customer = await User.create({
      name: fullName,
      email: `customer${i}@example.com`,
      phone: `0780${String(randInt(1000000, 9999999))}`,
      password: PASSWORD,
      role: "customer",
      restaurant: rid,
    });
    customers.push(customer);

    // 1–2 saved addresses
    const addressCount = randInt(1, 2);
    const addresses = [];
    for (let a = 0; a < addressCount; a++) {
      const addr = await Address.create({
        user: customer._id,
        label: a === 0 ? "البيت" : "العمل",
        fullAddress: `بغداد - ${pick(["الكرادة", "المنصور", "زيونة", "الجادرية", "اليرموك"])} - محلة ${randInt(100, 900)} - دار ${randInt(1, 80)}`,
        location: babylonLocation(),
        contactPhone: customer.phone,
        isDefault: a === 0,
      });
      addresses.push(addr);
    }

    // status: ~70% active, ~15% paused, ~15% expired
    const statusRoll = Math.random();
    let status = "active";
    if (statusRoll > 0.85) status = "expired";
    else if (statusRoll > 0.7) status = "paused";

    const plan = weightedPick(planDistribution);
    const start = daysAgo(randInt(1, 60));
    const periodDays = plan.billingPeriod === "weekly" ? 7 : 30;

    let endDate;
    if (status === "expired") endDate = daysAgo(randInt(1, 10));
    else endDate = daysFromNow(randInt(3, periodDays));

    const sub = await Subscription.create({
      restaurant: rid,
      user: customer._id,
      plan: plan._id,
      status,
      billingCycle: plan.billingPeriod,
      startDate: start,
      endDate,
      nextPaymentDate: endDate,
      autoRenew: status !== "expired",
      deliveryAddress: addresses[0]._id,
      preferredBranch: pick([karrada, mansour])._id,
      dietaryNotes: status === "active" ? pick(DIETARY_NOTES) : undefined,
      pausedAt: status === "paused" ? daysAgo(randInt(1, 5)) : undefined,
      pausedReason: status === "paused" ? "سفر مؤقت" : undefined,
      mealsConsumedTotal: randInt(0, 40),
    });

    // An invoice for the subscription period.
    await Invoice.create({
      invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}-${i}`,
      restaurant: rid,
      user: customer._id,
      subscription: sub._id,
      plan: plan._id,
      amount: plan.discountedPrice,
      currency: "IQD",
      status: status === "expired" ? "overdue" : "paid",
      billingCycle: plan.billingPeriod,
      paymentMethod: pick(["cash", "zaincash", "qicard", "fib"]),
      paidAt: status === "expired" ? null : start,
      periodStart: start,
      periodEnd: endDate,
      dueDate: endDate,
    });

    if (status === "active") {
      activeSubscriptions.push({ sub, plan, user: customer, address: addresses[0] });
    }
  }
  console.log(
    `Created 30 customers, ${activeSubscriptions.length} active subscriptions`,
  );

  // ── Step 9: today's subscriber meals ────────────────────────────────────────
  const PREFERENCE_CATEGORIES = [
    "chicken", "meat", "fish", "salads", "keto", "vegetarian", "pasta", "sandwiches",
  ];
  function mealForToday() {
    const slug = pick(PREFERENCE_CATEGORIES);
    const list = mealsByCategory[slug] || meals;
    return pick(list);
  }
  function todayAt(hour) {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d;
  }
  function rollStatus() {
    const r = Math.random();
    if (r < 0.2) return "delivered";
    if (r < 0.45) return "ready";
    if (r < 0.8) return "preparing";
    return "scheduled";
  }

  let subscriberMealCount = 0;
  for (const { sub, plan, user, address } of activeSubscriptions) {
    const branch = pick([karrada, mansour]);
    const branchDrivers = driversByBranch[branch._id];

    const mealPlan = [{ number: 1, hour: 13 }];
    if (plan.mealCount >= 2) mealPlan.push({ number: 2, hour: 19 });
    if (plan.mealCount === 3) mealPlan.push({ number: 3, hour: 9 });

    for (const mp of mealPlan) {
      const status = rollStatus();
      const assignDriver = ["ready", "dispatched", "delivered"].includes(status);
      await SubscriberMeal.create({
        restaurant: rid,
        subscription: sub._id,
        user: user._id,
        date: todayAt(0),
        mealNumber: mp.number,
        meal: mealForToday()._id,
        branch: branch._id,
        deliveryAddress: address._id,
        driver: assignDriver && branchDrivers.length ? pick(branchDrivers)._id : undefined,
        status,
        scheduledTime: todayAt(mp.hour),
        preparedAt: ["ready", "dispatched", "delivered"].includes(status) ? todayAt(mp.hour - 2) : undefined,
        deliveredAt: status === "delivered" ? todayAt(mp.hour) : undefined,
      });
      subscriberMealCount++;
    }
  }
  console.log(`Created ${subscriberMealCount} subscriber meals for today`);

  // ── Step 10: historical orders ──────────────────────────────────────────────
  const ORDER_STATUSES = ["delivered", "delivered", "delivered", "cancelled", "preparing", "ready"];
  let orderCount = 0;
  for (let i = 0; i < 50; i++) {
    const customer = pick(customers);
    const branch = pick([karrada, mansour]);
    const itemCount = randInt(1, 3);
    const items = [];
    for (let j = 0; j < itemCount; j++) {
      const meal = pick(meals);
      items.push({
        meal: meal._id,
        mealName: meal.name,
        originalPrice: meal.price,
        sellingPrice: meal.price,
        quantity: randInt(1, 2),
      });
    }
    const linkSub = Math.random() < 0.5;
    const sub = linkSub ? pick(activeSubscriptions) : null;
    const status = pick(ORDER_STATUSES);

    const order = await Order.create({
      restaurant: rid,
      branch: branch._id,
      customer: customer._id,
      subscription: sub ? sub.sub._id : undefined,
      items,
      status,
      paymentMethod: pick(["cash", "zaincash", "qicard", "fib"]),
      paymentStatus: status === "delivered" ? "paid" : "pending",
      deliveredAt: status === "delivered" ? daysAgo(randInt(0, 30)) : undefined,
    });
    // Backdate creation so the history is spread over the last 30 days.
    await Order.updateOne(
      { _id: order._id },
      { $set: { createdAt: daysAgo(randInt(0, 30)) } },
      { timestamps: false },
    );
    orderCount++;
  }
  console.log(`Created ${orderCount} historical orders`);

  // ── Step 11: summary ────────────────────────────────────────────────────────
  console.log("\n──────────── SEED SUMMARY ────────────");
  console.log(`Restaurant: Diet Food (slug: dietfood)`);
  console.log(`Branches: ${branches.length}`);
  console.log(`Plans: ${planDefs.length}`);
  console.log(`Categories: ${categoryDefs.length}`);
  console.log(`Meals: ${meals.length}`);
  console.log(`Staff: ${staffDefs.length + 1}`);
  console.log(`Drivers: ${driverDefs.length}`);
  console.log(`Customers: ${customers.length}`);
  console.log(`Active subscriptions: ${activeSubscriptions.length}`);
  console.log(`Today's subscriber meals: ${subscriberMealCount}`);
  console.log(`Historical orders: ${orderCount}`);
  console.log("──────────────────────────────────────\n");

  await mongoose.connection.close();
  console.log("Connection closed. Done.");
}

run().catch(async (err) => {
  console.error("Seed failed:", err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
