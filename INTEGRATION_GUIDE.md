# Pharmacy Backend — Integration Guide

> Covers two feature sets added in this session:
> 1. **Client Debt / Pay-Later** — sell on credit, track what each client owes, record payments
> 2. **Bulk Product Import** — upload an `.xlsx` / `.xls` / `.csv` file to seed or update the product catalogue

---

## Table of Contents

1. [Authentication Reminder](#1-authentication-reminder)
2. [Client Debt — Overview](#2-client-debt--overview)
3. [Pay-Later Sale Flow](#3-pay-later-sale-flow)
4. [Client Debt Endpoints](#4-client-debt-endpoints)
   - [Create a debt manually](#41-create-a-debt-manually)
   - [List all debts](#42-list-all-debts)
   - [Get a single debt](#43-get-a-single-debt)
   - [Record a payment](#44-record-a-payment)
   - [Debt summary (dashboard)](#45-debt-summary-dashboard)
   - [Delete a debt](#46-delete-a-debt)
5. [Client Profile — Debt Section](#5-client-profile--debt-section)
6. [Bulk Product Import](#6-bulk-product-import)
   - [How it works](#61-how-it-works)
   - [Supported column names](#62-supported-column-names)
   - [Import endpoint](#63-import-endpoint)
   - [Import results & error handling](#64-import-results--error-handling)
7. [Schema Reference](#7-schema-reference)
8. [Changed Files Summary](#8-changed-files-summary)

---

## 1. Authentication Reminder

Every endpoint below requires a valid JWT.

```
Authorization: Bearer <token>
```

The token is obtained from `POST /api/v1/auth/login`.  
All routes automatically scope data to the authenticated user's pharmacy via the `setPharmacyScope` middleware — you never need to pass `pharmacyId` in the body unless the docs say otherwise.

**Role hierarchy used in this guide:**

| Role | Abbreviation used below |
|------|------------------------|
| owner | O |
| manager | M |
| employee | E |

---

## 2. Client Debt — Overview

### What was added

| # | Change | File |
|---|--------|------|
| 1 | New `ClientDebt` model | `models/clientDebtModel.js` |
| 2 | New `clientDebtController` with 5 operations | `controllers/clientDebtController.js` |
| 3 | New route group `/api/v1/client-debts` | `routes/clientDebtRoutes.js` |
| 4 | `"later"` added to `Sale.paymentMethod` enum | `models/saleModel.js` |
| 5 | `totalDebt` field added to `Client` model | `models/clientModel.js` |
| 6 | Sale creation auto-creates a `ClientDebt` when `paymentMethod = "later"` | `controllers/saleController.js` |
| 7 | Client profile response now includes `debt.summary` and `debt.activeDebts` | `controllers/clientController.js` |

### Debt lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  Sale created with paymentMethod = "later"                   │
│  OR  POST /api/v1/client-debts  (manual)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ status = "pending"
                           ▼
               ┌───────────────────────┐
               │   ClientDebt record   │
               │   amountPaid = 0      │
               └──────────┬────────────┘
                          │  PATCH /:id/payment  (partial)
                          ▼
               ┌───────────────────────┐
               │  status = "partial"   │
               │  amountPaid > 0       │
               └──────────┬────────────┘
                          │  PATCH /:id/payment  (full)
                          ▼
               ┌───────────────────────┐
               │   status = "paid"     │
               │  amountPaid = amount  │
               └───────────────────────┘

  If dueDate is set and today > dueDate → isOverdue = true  (virtual field)
```

---

## 3. Pay-Later Sale Flow

This is the most common path. The cashier picks `paymentMethod: "later"` during a regular sale. The system creates both the `Sale` document **and** a linked `ClientDebt` document automatically.

### Step 1 — Create the sale with `paymentMethod: "later"`

```
POST /api/v1/sales
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "client": "664abc123def456789000001",
  "paymentMethod": "later",
  "debtDueDate": "2026-05-17",
  "debtNotes": "Client pays at end of month",
  "items": [
    {
      "product": "664abc123def456789000010",
      "quantity": 2,
      "sellingPrice": 15000,
      "sellingMode": "pack"
    },
    {
      "product": "664abc123def456789000011",
      "quantity": 1,
      "sellingPrice": 8500,
      "sellingMode": "piece"
    }
  ],
  "discount": 0
}
```

> **Rules:**
> - `client` is **required** for pay-later sales. The API returns `400` if it is missing.
> - `debtDueDate` is optional. If omitted, the debt has no due date and `isOverdue` will always be `false`.
> - `debtNotes` is optional free text stored on the `ClientDebt` record.

### Step 1 — Response `201`

```json
{
  "status": "success",
  "data": {
    "sale": {
      "_id": "664sale000000000000000001",
      "saleNumber": "SL-1713300000000-A3B2C",
      "pharmacy": "664pharm00000000000000001",
      "cashier": "664user000000000000000001",
      "client": "664abc123def456789000001",
      "paymentMethod": "later",
      "items": [
        {
          "product": "664abc123def456789000010",
          "productName": "Amoxicillin 500mg",
          "quantity": 2,
          "sellingPrice": 15000,
          "totalPrice": 30000,
          "profit": 4000
        },
        {
          "product": "664abc123def456789000011",
          "productName": "Vitamin C 1000mg",
          "quantity": 1,
          "sellingPrice": 8500,
          "totalPrice": 8500,
          "profit": 1200
        }
      ],
      "totalAmount": 38500,
      "discount": 0,
      "finalAmount": 38500,
      "totalProfit": 5200,
      "createdAt": "2026-04-17T10:30:00.000Z"
    }
  }
}
```

### What happens behind the scenes

```
saleController.createSale()
  │
  ├── Stock deducted for each item
  ├── Sale document created  (paymentMethod = "later")
  ├── Cashier stats updated  (totalSales, totalProfit, totalSalesCount)
  ├── Pharmacy revenue updated
  ├── Product stats updated  (totalSold, totalRevenue, totalProfit)
  ├── Client stats updated   (totalPurchases, totalSpent, lastVisit)
  │
  └── paymentMethod === "later"  →  ClientDebt.create({
        pharmacy:       <pharmacy>,
        client:         "664abc123def456789000001",
        sale:           "664sale000000000000000001",
        originalAmount: 38500,
        currentAmount:  38500,
        amountPaid:     0,
        status:         "pending",
        dueDate:        "2026-05-17"
      })
      Client.totalDebt  +=  38500
```

---

## 4. Client Debt Endpoints

Base path: `/api/v1/client-debts`

---

### 4.1 Create a Debt Manually

Use this when a debt exists outside of a specific sale (e.g. a legacy balance carried forward).

```
POST /api/v1/client-debts
Roles: O, M, E
```

**Request body**

```json
{
  "client": "664abc123def456789000001",
  "originalAmount": 50000,
  "dueDate": "2026-06-01",
  "notes": "Carried over from previous month"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client` | ObjectId | ✅ | Must belong to this pharmacy |
| `originalAmount` | Number | ✅ | Must be > 0 |
| `dueDate` | ISO date string | ❌ | Payment deadline |
| `notes` | String | ❌ | Free text |

**Response `201`**

```json
{
  "status": "success",
  "data": {
    "debt": {
      "_id": "664debt00000000000000001",
      "pharmacy": "664pharm00000000000000001",
      "client": {
        "_id": "664abc123def456789000001",
        "name": "Ahmed Ali",
        "phone": "07701234567"
      },
      "sale": null,
      "createdBy": { "_id": "664user000000000000000001", "name": "Sara Manager" },
      "originalAmount": 50000,
      "currentAmount": 50000,
      "amountPaid": 0,
      "dueDate": "2026-06-01T00:00:00.000Z",
      "status": "pending",
      "payments": [],
      "notes": "Carried over from previous month",
      "remainingAmount": 50000,
      "isOverdue": false,
      "createdAt": "2026-04-17T10:45:00.000Z"
    }
  }
}
```

**Error — client not found `404`**

```json
{
  "status": "fail",
  "message": "Client not found"
}
```

**Error — missing amount `400`**

```json
{
  "status": "fail",
  "message": "Amount must be a positive number"
}
```

---

### 4.2 List All Debts

```
GET /api/v1/client-debts
Roles: O, M, E
```

**Query parameters**

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `client` | ObjectId | `?client=664abc...` | Filter by client |
| `status` | String | `?status=pending` | `pending` / `partial` / `paid` / `overdue` |
| `overdue` | Boolean | `?overdue=true` | Only debts past due date (not paid) |
| `page` | Number | `?page=2` | Default `1` |
| `limit` | Number | `?limit=10` | Default `20`, max `100` |

**Request examples**

```
GET /api/v1/client-debts?status=pending
GET /api/v1/client-debts?client=664abc123def456789000001
GET /api/v1/client-debts?overdue=true&page=1&limit=20
```

**Response `200`**

```json
{
  "status": "success",
  "results": 2,
  "total": 2,
  "pages": 1,
  "data": {
    "debts": [
      {
        "_id": "664debt00000000000000001",
        "client": { "_id": "664abc123def456789000001", "name": "Ahmed Ali", "phone": "07701234567" },
        "sale": { "_id": "664sale000000000000000001", "saleNumber": "SL-1713300000000-A3B2C", "finalAmount": 38500 },
        "originalAmount": 38500,
        "currentAmount": 38500,
        "amountPaid": 0,
        "dueDate": "2026-05-17T00:00:00.000Z",
        "status": "pending",
        "remainingAmount": 38500,
        "isOverdue": false,
        "createdAt": "2026-04-17T10:30:00.000Z"
      },
      {
        "_id": "664debt00000000000000002",
        "client": { "_id": "664abc123def456789000002", "name": "Fatima Hassan", "phone": "07709876543" },
        "sale": null,
        "originalAmount": 50000,
        "currentAmount": 50000,
        "amountPaid": 20000,
        "status": "partial",
        "remainingAmount": 30000,
        "isOverdue": false,
        "createdAt": "2026-04-10T09:00:00.000Z"
      }
    ]
  }
}
```

---

### 4.3 Get a Single Debt

```
GET /api/v1/client-debts/:id
Roles: O, M, E
```

**Response `200`**

```json
{
  "status": "success",
  "data": {
    "debt": {
      "_id": "664debt00000000000000002",
      "client": { "_id": "664abc123def456789000002", "name": "Fatima Hassan", "phone": "07709876543" },
      "sale": null,
      "createdBy": { "_id": "664user000000000000000001", "name": "Sara Manager" },
      "originalAmount": 50000,
      "currentAmount": 50000,
      "amountPaid": 20000,
      "dueDate": "2026-06-01T00:00:00.000Z",
      "status": "partial",
      "payments": [
        {
          "_id": "664pay000000000000000001",
          "amount": 20000,
          "method": "cash",
          "notes": "Paid in store",
          "paidAt": "2026-04-15T14:00:00.000Z"
        }
      ],
      "remainingAmount": 30000,
      "isOverdue": false,
      "createdAt": "2026-04-10T09:00:00.000Z"
    }
  }
}
```

---

### 4.4 Record a Payment

```
PATCH /api/v1/client-debts/:id/payment
Roles: O, M, E
```

**Request body**

```json
{
  "amount": 15000,
  "method": "cash",
  "notes": "Client paid partial amount at counter"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | Number | ✅ | Must be > 0 and ≤ remaining balance |
| `method` | String | ❌ | `"cash"` (default) / `"card"` / `"transfer"` / any string |
| `notes` | String | ❌ | Free text |

**Response `200` — partial payment**

```json
{
  "status": "success",
  "data": {
    "debt": {
      "_id": "664debt00000000000000002",
      "client": { "_id": "664abc123def456789000002", "name": "Fatima Hassan", "phone": "07709876543" },
      "originalAmount": 50000,
      "currentAmount": 50000,
      "amountPaid": 35000,
      "status": "partial",
      "remainingAmount": 15000,
      "payments": [
        {
          "amount": 20000,
          "method": "cash",
          "notes": "Paid in store",
          "paidAt": "2026-04-15T14:00:00.000Z"
        },
        {
          "amount": 15000,
          "method": "cash",
          "notes": "Client paid partial amount at counter",
          "paidAt": "2026-04-17T11:00:00.000Z"
        }
      ]
    }
  }
}
```

**Response `200` — fully paid (final payment)**

```json
{
  "status": "success",
  "data": {
    "debt": {
      "status": "paid",
      "amountPaid": 50000,
      "remainingAmount": 0
    }
  }
}
```

**Error — over-payment `400`**

```json
{
  "status": "fail",
  "message": "Payment exceeds remaining balance. Remaining: 15000"
}
```

**Error — already paid `400`**

```json
{
  "status": "fail",
  "message": "This debt is already fully paid"
}
```

#### Side effect on `Client.totalDebt`

Every time a payment is recorded, `Client.totalDebt` is decremented by the payment amount automatically. This keeps the running balance on the client's profile in sync.

---

### 4.5 Debt Summary (Dashboard)

```
GET /api/v1/client-debts/summary
Roles: O, M  (restricted)
```

**Optional query param**

```
GET /api/v1/client-debts/summary?client=664abc123def456789000001
```

If `client` is provided, the summary is scoped to that one client. Otherwise it covers the whole pharmacy.

**Response `200`**

```json
{
  "status": "success",
  "data": {
    "totalDebt": 380000,
    "totalPaid": 120000,
    "totalRemaining": 260000,
    "totalClientsWithDebt": 14,
    "overdueCount": 3,
    "overdueAmount": 75000
  }
}
```

| Field | Meaning |
|-------|---------|
| `totalDebt` | Sum of `currentAmount` for all unpaid debts |
| `totalPaid` | Sum of `amountPaid` across all those debts |
| `totalRemaining` | `totalDebt − totalPaid` |
| `totalClientsWithDebt` | Distinct clients who have at least one unpaid debt |
| `overdueCount` | Number of debts past their `dueDate` |
| `overdueAmount` | Total remaining on overdue debts |

---

### 4.6 Delete a Debt

```
DELETE /api/v1/client-debts/:id
Roles: O, M
```

> Only debts with `status = "pending"` (no payments recorded yet) can be deleted.  
> Deleting reverses `Client.totalDebt` automatically.

**Response `204`** — no body

**Error — has payments `400`**

```json
{
  "status": "fail",
  "message": "Only pending debts with no payments can be deleted"
}
```

---

## 5. Client Profile — Debt Section

The existing `GET /api/v1/clients/:id` endpoint now includes a `debt` block alongside the existing `sales` and `summary` blocks.

```
GET /api/v1/clients/664abc123def456789000001
Roles: O, M, E
```

**Response `200`** (abbreviated — only the new `debt` block shown)

```json
{
  "status": "success",
  "data": {
    "client": {
      "_id": "664abc123def456789000001",
      "name": "Ahmed Ali",
      "phone": "07701234567",
      "totalPurchases": 12,
      "totalSpent": 420000,
      "totalDebt": 38500
    },
    "summary": {
      "totalSpent": 420000,
      "totalDiscount": 5000,
      "totalPurchases": 12,
      "lastVisit": "2026-04-17T10:30:00.000Z"
    },
    "sales": {
      "data": [ "...paginated sale objects..." ],
      "total": 12,
      "page": 1,
      "limit": 10,
      "pages": 2
    },
    "debt": {
      "summary": {
        "totalDebt": 88500,
        "totalPaid": 50000,
        "totalRemaining": 38500,
        "overdueCount": 0
      },
      "activeDebts": [
        {
          "_id": "664debt00000000000000001",
          "sale": {
            "_id": "664sale000000000000000001",
            "saleNumber": "SL-1713300000000-A3B2C",
            "finalAmount": 38500,
            "createdAt": "2026-04-17T10:30:00.000Z"
          },
          "originalAmount": 38500,
          "currentAmount": 38500,
          "amountPaid": 0,
          "dueDate": "2026-05-17T00:00:00.000Z",
          "status": "pending",
          "remainingAmount": 38500,
          "isOverdue": false,
          "payments": []
        }
      ]
    }
  }
}
```

> `activeDebts` only contains debts that are **not** `paid`. Fully paid debts are excluded from this array but are counted in the aggregate `summary`.

---

## 6. Bulk Product Import

### 6.1 How It Works

```
Client sends .xlsx file
        │
        ▼
  multer (memory storage)
  validates: only .xlsx / .xls / .csv, max 10 MB
        │
        ▼
  SheetJS (xlsx) parses workbook
  — uses first sheet unless ?sheet=<name>
  — auto-detects header row (first row with ≥ 2 non-empty cells)
        │
        ▼
  buildHeaderMap()
  — normalises every column header (trim + lowercase)
  — matches against ~80 Arabic & English aliases
  — maps column index → internal field name
        │
        ▼
  For each data row:
  ┌───────────────────────────────────────────────────────┐
  │  1. Skip fully empty rows                              │
  │  2. Require product name  → skip row if missing        │
  │  3. Parse & sanitise each field                        │
  │     • Barcode: scientific notation → integer string    │
  │     • Numbers: strip commas, parse float               │
  │     • Dates: JS Date / Excel serial / ISO string       │
  │  4. Look up section by name (case-insensitive)         │
  │  5. Find existing product:                             │
  │     a. by barcode (exact match)                        │
  │     b. by name (case-insensitive exact match)          │
  │  6a. FOUND  → update missing fields + add new variant  │
  │  6b. NOT FOUND → create new product with one variant   │
  └───────────────────────────────────────────────────────┘
        │
        ▼
  Return summary: created / updated / skipped / errors
```

---

### 6.2 Supported Column Names

The header row of your file can use **any** of the aliases below (Arabic or English, case-insensitive, leading/trailing spaces stripped).

| Internal field | Arabic aliases | English aliases |
|----------------|---------------|-----------------|
| **name** *(required)* | اسم المنتج، اسم الدواء، المنتج، الدواء، الاسم | name, product name, product |
| **barcode** | الباركود، باركود، الكود، كود | barcode, code |
| **dosageForm** | النوع، شكل الدواء، الصنف، الشكل، الوحدة، وحدة | dosage form, form, type, unit |
| **quantity** | الكمية المتوفرة، الكمية، الكمية في المخزن، كمية | quantity, qty, stock, available quantity |
| **originalPrice** | تكلفة الشريط، كلفة الشريط، سعر الشراء، الكلفة، التكلفة | cost, original price, purchase price, cost price |
| **sellingPrice** | سعر بيع الشريط، سعر البيع، سعر البيع للوحدة، سعر البيع للعبوة | selling price, price, sale price |
| **piecePrice** | سعر القطعة، سعر بيع القطعة، سعر القطعة الواحدة | piece price, unit price |
| **expireDate** | تاريخ الصلاحية، انتهاء الصلاحية، الصلاحية | expiry, expire date, expiry date, expiration date |
| **batchNumber** | رقم الدفعة، الدفعة، رقم التشغيلة | batch, batch number, lot, lot number |
| **manufacturer** | الشركة المصنعة، المصنّع، المصنع، الشركة | manufacturer, company |
| **genericName** | الاسم الجنيسي، الاسم العلمي، الاسم الدوائي | generic name, generic, scientific name |
| **description** | الوصف، ملاحظات، تفاصيل | description, notes, remarks |
| **piecesPerPack** | عدد القطع في العبوة، قطع في الشريط، عدد القطع | pieces per pack, pcs per pack, pieces |
| **sectionName** | القسم، الفئة، الشعبة | section, department, category |
| **minimumStock** | الحد الأدنى، الحد الأدنى للمخزون | minimum stock, min stock, reorder level |

> Columns that don't match any alias are silently ignored — they won't cause errors.

#### Barcode handling

Excel stores long barcodes in scientific notation (e.g. `8.90111E+12`). The importer converts these automatically:

```
8.90111E+12  →  "8901110000000"
```

---

### 6.3 Import Endpoint

```
POST /api/v1/products/import
Roles: O, M
Content-Type: multipart/form-data
```

**Form fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | ✅ | `.xlsx`, `.xls`, or `.csv` — max 10 MB |
| `sheet` | String | ❌ | Sheet name to read. Defaults to the first sheet |

#### cURL example

```bash
curl -X POST https://your-api.com/api/v1/products/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/products_2026-04-15.xlsx"
```

#### JavaScript (fetch) example

```javascript
const formData = new FormData();
formData.append("file", fileInput.files[0]);
// optionally: formData.append("sheet", "قائمة المنتجات");

const res = await fetch("/api/v1/products/import", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
const data = await res.json();
console.log(data);
```

#### Axios example

```javascript
import axios from "axios";

const formData = new FormData();
formData.append("file", file); // File object from input

const { data } = await axios.post("/api/v1/products/import", formData, {
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "multipart/form-data",
  },
});
```

---

### 6.4 Import Results & Error Handling

**Response `200` — success with no errors**

```json
{
  "status": "success",
  "message": "Import complete: 48 created, 5 updated, 1 skipped, 0 errors",
  "data": {
    "created": 48,
    "updated": 5,
    "skipped": 1,
    "errors": [],
    "skippedDetails": [
      { "row": 12, "reason": "Missing product name" }
    ]
  }
}
```

**Response `200` — success with some row-level errors**

```json
{
  "status": "success",
  "message": "Import complete: 44 created, 5 updated, 1 skipped, 4 errors",
  "data": {
    "created": 44,
    "updated": 5,
    "skipped": 1,
    "errors": [
      { "row": 7,  "name": "Amoxicillin 500mg", "error": "Cast to Number failed for value \"N/A\"" },
      { "row": 19, "name": "Vitamin D3",        "error": "Cast to Number failed for value \"\"" },
      { "row": 33, "name": "Omeprazole 20mg",   "error": "Product validation failed: barcode: Duplicate key" },
      { "row": 51, "name": null,                 "error": "Missing product name" }
    ],
    "skippedDetails": [
      { "row": 3, "reason": "Missing product name" }
    ]
  }
}
```

> The overall HTTP status is still `200` when row-level errors occur — the import ran to completion. Check `data.errors` to find rows that need to be fixed and re-imported.

**Response `400` — no file sent**

```json
{
  "status": "fail",
  "message": "No file uploaded"
}
```

**Response `400` — wrong file type**

```json
{
  "status": "fail",
  "message": "Only .xlsx / .xls / .csv files are allowed"
}
```

**Response `400` — headers not recognised**

```json
{
  "status": "fail",
  "message": "Could not recognise any column headers in the file. Make sure the first row contains column names."
}
```

**Response `400` — sheet name not found**

```json
{
  "status": "fail",
  "message": "Sheet \"Sheet3\" not found in file"
}
```

#### Merge / update logic detail

| Scenario | What happens |
|----------|-------------|
| Row barcode matches existing product | Product-level missing fields filled; new variant added |
| Row name matches existing product (no barcode hit) | Same as above |
| No match found | New product created |
| Row has no `originalPrice` and product exists | Variant is **not** added; only product-level fields are updated |
| Row has no `originalPrice` and product is new | Product created with `variants: []` (no stock) |
| Section name matches a section in this pharmacy | `product.section` is linked automatically |
| Section name doesn't match | `section` left unset — no error thrown |

---

## 7. Schema Reference

### ClientDebt

```
ClientDebt {
  _id           : ObjectId
  pharmacy      : ObjectId  → Pharmacy
  client        : ObjectId  → Client     (required)
  sale          : ObjectId  → Sale       (optional — set when auto-created from pay-later sale)
  createdBy     : ObjectId  → User       (required)
  originalAmount: Number    (required, immutable after creation)
  currentAmount : Number    (= originalAmount; may increase if penalties are added later)
  amountPaid    : Number    (default 0, incremented with each payment)
  dueDate       : Date      (optional)
  status        : "pending" | "partial" | "paid" | "overdue"
  payments      : [
    {
      amount     : Number   (required)
      paidAt     : Date     (default now)
      method     : String   (default "cash")
      notes      : String
      recordedBy : ObjectId → User
    }
  ]
  notes         : String

  — virtuals (included in JSON output) —
  remainingAmount : max(0, currentAmount − amountPaid)
  isOverdue       : status !== "paid" && dueDate && now > dueDate

  — timestamps —
  createdAt, updatedAt
}
```

### Client (updated fields)

```diff
  totalPurchases : Number   (existing)
  totalSpent     : Number   (existing)
+ totalDebt      : Number   (new — running sum of unpaid debt amounts)
  lastVisit      : Date     (existing)
```

### Sale (updated enum)

```diff
  paymentMethod : "cash" | "card" | "insurance" | "mixed"
+               | "later"
```

---

## 8. Changed Files Summary

| File | Type | What changed |
|------|------|-------------|
| `models/clientDebtModel.js` | **New** | `ClientDebt` schema |
| `controllers/clientDebtController.js` | **New** | getAllClientDebts, getClientDebt, createClientDebt, makePayment, getClientDebtSummary, deleteClientDebt |
| `routes/clientDebtRoutes.js` | **New** | Route group for `/api/v1/client-debts` |
| `controllers/importController.js` | **New** | Bulk product import from xlsx/xls/csv |
| `models/saleModel.js` | Modified | `paymentMethod` enum: added `"later"` |
| `models/clientModel.js` | Modified | Added `totalDebt: Number` field |
| `controllers/saleController.js` | Modified | Auto-creates `ClientDebt` when `paymentMethod === "later"`; requires `client` for pay-later sales |
| `controllers/clientController.js` | Modified | `getClient` now fetches and returns `debt.summary` + `debt.activeDebts` |
| `routes/productRoutes.js` | Modified | Added `POST /api/v1/products/import` |
| `app.js` | Modified | Registered `/api/v1/client-debts` route group |
| `package.json` | Modified | Added `xlsx` dependency |
