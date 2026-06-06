const multer = require("multer");
const XLSX = require("xlsx");
const Meal = require("../models/mealModel");
const Section = require("../models/sectionModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { logActivity } = require("../utils/activityLogger");

// ---------------------------------------------------------------------------
// Multer — accept only xlsx/xls/csv files, keep in memory
// ---------------------------------------------------------------------------
const xlsxStorage = multer.memoryStorage();
const xlsxFilter = (req, file, cb) => {
  const allowed = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
  ];
  const extOk = /\.(xlsx|xls|csv)$/i.test(file.originalname);
  if (allowed.includes(file.mimetype) || extOk) {
    cb(null, true);
  } else {
    cb(new AppError("Only .xlsx / .xls / .csv files are allowed", 400), false);
  }
};
const uploadXlsx = multer({ storage: xlsxStorage, fileFilter: xlsxFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// Column header aliases  (Arabic + English variants)
// Each key is our internal field name; the array contains possible header
// strings (compared case-insensitively after trimming whitespace).
// ---------------------------------------------------------------------------
const FIELD_ALIASES = {
  name:               ["اسم المنتج", "اسم الدواء", "المنتج", "الدواء", "الاسم", "name", "meal name", "meal"],
  barcode:            ["الباركود", "باركود", "الكود", "كود", "barcode", "code"],
  dosageForm:         ["النوع", "شكل الدواء", "الصنف", "الشكل", "الوحدة", "وحدة", "dosage form", "form", "type", "unit"],
  quantity:           ["الكمية المتوفرة", "الكمية", "الكمية في المخزن", "كمية", "quantity", "qty", "stock", "available quantity"],
  originalPrice:      ["تكلفة الشريط", "كلفة الشريط", "سعر الشراء", "الكلفة", "التكلفة", "كلفة", "original price", "cost", "purchase price", "cost price"],
  sellingPrice:       ["سعر بيع الشريط", "سعر البيع", "سعر البيع للوحدة", "سعر البيع للعبوة", "selling price", "price", "order price"],
  piecePrice:         ["سعر القطعة", "سعر بيع القطعة", "سعر القطعة الواحدة", "piece price", "unit price"],
  expireDate:         ["تاريخ الصلاحية", "انتهاء الصلاحية", "الصلاحية", "تاريخ انتهاء الصلاحية", "expiry", "expire date", "expiry date", "expiration date"],
  batchNumber:        ["رقم الدفعة", "الدفعة", "رقم التشغيلة", "batch", "batch number", "lot", "lot number"],
  manufacturer:       ["الشركة المصنعة", "المصنّع", "المصنع", "الشركة", "manufacturer", "company"],
  genericName:        ["الاسم الجنيسي", "الاسم العلمي", "الاسم الدوائي", "generic name", "generic", "scientific name"],
  description:        ["الوصف", "ملاحظات", "تفاصيل", "description", "notes", "remarks"],
  piecesPerPack:      ["عدد القطع في العبوة", "قطع في الشريط", "عدد القطع", "pieces per pack", "pcs per pack", "pieces"],
  sectionName:        ["القسم", "الفئة", "الشعبة", "section", "department", "category"],
  minimumStock:       ["الحد الأدنى", "الحد الأدنى للمخزون", "minimum stock", "min stock", "reorder level"],
};

/**
 * Build a lookup: normalised header string → internal field name
 */
function buildHeaderMap(rawHeaders) {
  const map = {}; // rawHeader → fieldName

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      map[alias.trim().toLowerCase()] = field;
    }
  }

  const result = {}; // columnIndex → fieldName
  rawHeaders.forEach((h, i) => {
    if (h == null) return;
    const normalised = String(h).trim().toLowerCase();
    if (map[normalised]) {
      // first match wins if two columns map to the same field
      if (!Object.values(result).includes(map[normalised])) {
        result[i] = map[normalised];
      }
    }
  });

  return result;
}

/**
 * Safely parse a barcode that Excel may have stored as a float/scientific
 * (e.g. 8.90111E+12) → "8901110000000"
 */
function parseBarcode(raw) {
  if (raw == null || raw === "") return null;
  // If xlsx already gave us a number, convert without losing precision
  if (typeof raw === "number") {
    // use toFixed to avoid scientific notation, then strip trailing zeros
    return String(Math.round(raw));
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Handle scientific notation strings like "8.90111E+12"
  if (/e[+-]/i.test(s)) {
    return String(Math.round(parseFloat(s)));
  }
  return s.replace(/\s/g, "");
}

function parseNumber(raw) {
  if (raw == null || raw === "") return undefined;
  const n = Number(String(raw).replace(/,/g, ""));
  return isNaN(n) ? undefined : n;
}

function parseDate(raw) {
  if (raw == null || raw === "") return undefined;
  // xlsx can return a JS Date object directly
  if (raw instanceof Date) return raw;
  // Excel serial number
  if (typeof raw === "number") {
    return XLSX.SSF.parse_date_code(raw);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

function rowToObject(row, headerMap) {
  const obj = {};
  for (const [colIdx, field] of Object.entries(headerMap)) {
    const val = row[parseInt(colIdx, 10)];
    if (val != null && val !== "") {
      obj[field] = val;
    }
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Main import handler
// ---------------------------------------------------------------------------
exports.importMeals = [
  uploadXlsx.single("file"),
  catchAsync(async (req, res, next) => {
    if (!req.file) return next(new AppError("No file uploaded", 400));

    const restaurantId = req.restaurantScope;
    if (!restaurantId) return next(new AppError("Restaurant scope not set", 400));

    // --- Parse workbook ---
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true, raw: false });
    const sheetName = req.body.sheet || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return next(new AppError(`Sheet "${sheetName}" not found in file`, 400));

    // Get raw rows (arrays); first non-empty row is headers
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    // Find the header row — first row where at least 2 cells are non-empty strings
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const nonEmpty = allRows[i].filter((c) => c != null && String(c).trim() !== "");
      if (nonEmpty.length >= 2) { headerRowIndex = i; break; }
    }

    const rawHeaders = allRows[headerRowIndex];
    const headerMap = buildHeaderMap(rawHeaders);

    if (Object.keys(headerMap).length === 0) {
      return next(new AppError("Could not recognise any column headers in the file. Make sure the first row contains column names.", 400));
    }

    const dataRows = allRows.slice(headerRowIndex + 1);

    // Pre-load sections for name → id lookup
    const sections = await Section.find({ restaurant: restaurantId }).lean();
    const sectionByName = {};
    for (const s of sections) {
      sectionByName[s.name.trim().toLowerCase()] = s._id;
    }

    // Counters
    const results = { created: 0, updated: 0, skipped: 0, errors: [] };
    const skippedDetails = [];

    for (let ri = 0; ri < dataRows.length; ri++) {
      const rawRow = dataRows[ri];
      // Skip fully empty rows
      if (!rawRow || rawRow.every((c) => c == null || c === "")) continue;

      const row = rowToObject(rawRow, headerMap);
      const rowNum = headerRowIndex + 2 + ri; // 1-based Excel row number

      // --- Required: name ---
      const name = row.name ? String(row.name).trim() : null;
      if (!name) {
        results.skipped++;
        skippedDetails.push({ row: rowNum, reason: "Missing meal name" });
        continue;
      }

      // --- Optional fields ---
      const barcode      = parseBarcode(row.barcode);
      const originalPrice = parseNumber(row.originalPrice);
      const sellingPrice  = parseNumber(row.sellingPrice);
      const piecePrice    = parseNumber(row.piecePrice);
      const quantity      = parseNumber(row.quantity) ?? 0;
      const piecesPerPack = parseNumber(row.piecesPerPack) ?? 1;
      const minimumStock  = parseNumber(row.minimumStock);
      const expireDate    = parseDate(row.expireDate);
      const batchNumber   = row.batchNumber ? String(row.batchNumber).trim() : undefined;
      const dosageForm    = row.dosageForm   ? String(row.dosageForm).trim()  : undefined;
      const manufacturer  = row.manufacturer ? String(row.manufacturer).trim(): undefined;
      const genericName   = row.genericName  ? String(row.genericName).trim() : undefined;
      const description   = row.description  ? String(row.description).trim() : undefined;

      let sectionId;
      if (row.sectionName) {
        sectionId = sectionByName[String(row.sectionName).trim().toLowerCase()];
      }

      // --- Find existing meal (by barcode then by name) ---
      let meal = null;
      try {
        if (barcode) {
          meal = await Meal.findOne({ restaurant: restaurantId, barcode });
        }
        if (!meal) {
          meal = await Meal.findOne({
            restaurant: restaurantId,
            name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
          });
        }

        const variant = {
          originalPrice:           originalPrice ?? 0,
          recommendedSellingPrice: sellingPrice,
          recommendedPiecePrice:   piecePrice,
          quantityInStock:         quantity,
          piecesPerPack,
          expireDate,
          batchNumber,
          isActive:                true,
          receivedAt:              new Date(),
        };

        if (meal) {
          // Update meal-level fields if they're missing on the existing record
          if (!meal.barcode && barcode) meal.barcode = barcode;
          if (!meal.dosageForm && dosageForm) meal.dosageForm = dosageForm;
          if (!meal.manufacturer && manufacturer) meal.manufacturer = manufacturer;
          if (!meal.genericName && genericName) meal.genericName = genericName;
          if (!meal.description && description) meal.description = description;
          if (!meal.section && sectionId) meal.section = sectionId;
          if (minimumStock != null) meal.minimumStock = minimumStock;
          if (sellingPrice != null) meal.recommendedSellingPrice = sellingPrice;
          if (piecePrice  != null) meal.recommendedPiecePrice   = piecePrice;
          if (piecesPerPack)       meal.piecesPerPack            = piecesPerPack;

          // Add new variant only if originalPrice is present
          if (originalPrice != null) {
            meal.variants.push(variant);
          }

          await meal.save();
          results.updated++;
        } else {
          // Create new meal
          const newMealData = {
            name,
            restaurant: restaurantId,
            barcode,
            dosageForm,
            manufacturer,
            genericName,
            description,
            section: sectionId,
            minimumStock:              minimumStock ?? 10,
            recommendedSellingPrice:   sellingPrice ?? 0,
            recommendedPiecePrice:     piecePrice   ?? 0,
            piecesPerPack,
            variants: originalPrice != null ? [variant] : [],
          };

          await Meal.create(newMealData);
          results.created++;
        }
      } catch (err) {
        results.errors.push({ row: rowNum, name, error: err.message });
      }
    }

    results.skippedDetails = skippedDetails;

    await logActivity({
      user:        req.user._id,
      restaurant:    restaurantId,
      action:      "create",
      entityType:  "Meal",
      description: `Bulk import: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.errors.length} errors`,
    });

    res.status(200).json({
      status:  "success",
      message: `Import complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.errors.length} errors`,
      data:    results,
    });
  }),
];
