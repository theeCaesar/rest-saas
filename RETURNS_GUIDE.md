# Product Return — Integration Guide

> Covers everything added to support returning sold products:
> model schema changes, calculation logic, all endpoints, request/response
> bodies, error cases, and multi-scenario walkthroughs.

---

## Table of Contents

1. [What Was Added](#1-what-was-added)
2. [Schema Changes](#2-schema-changes)
3. [Calculation Logic](#3-calculation-logic)
4. [Endpoints](#4-endpoints)
   - [Process a Return](#41-post-apiv1salesidreturn)
   - [List Returns for a Sale](#42-get-apiv1salesidreturns)
   - [Filter Returns in Sales List](#43-get-apiv1salesisreturntrue)
   - [View a Return Sale](#44-get-apiv1salesid)
5. [Worked Examples](#5-worked-examples)
   - [Full Return — Cash Refund](#51-full-return--cash-refund)
   - [Partial Return — Two Items, One Returned](#52-partial-return--two-items-one-returned)
   - [Return from a Pay-Later Sale](#53-return-from-a-pay-later-sale)
   - [Second Partial Return on Same Sale](#54-second-partial-return-on-same-sale)
6. [Error Reference](#6-error-reference)
7. [Side Effects Reference](#7-side-effects-reference)

---

## 1. What Was Added

| File | Change |
|------|--------|
| `models/saleModel.js` | `returnedQuantity` on each sale item; `originalSale`, `returnReason`, `refundMethod`, `returnStatus` on the sale; index on `originalSale` |
| `controllers/saleController.js` | `returnSale` handler, `getSaleReturns` handler, `isReturn` filter in `getAllSales`, `originalSale` added to `getSale` populate |
| `routes/saleRoutes.js` | `POST /:id/return`, `GET /:id/returns` |

---

## 2. Schema Changes

### Sale Item — new field

```
returnedQuantity : Number  (default 0)
```

Tracks how many units of this specific line item have already been returned across all return sessions. Used to enforce the returnable-quantity cap on subsequent returns.

### Sale Document — new fields

| Field | Type | Values | Set on |
|-------|------|--------|--------|
| `returnStatus` | String | `"none"` / `"partial"` / `"full"` | **Original** sale |
| `isReturn` | Boolean | `true` / `false` | **Return** sale (`true`) |
| `originalSale` | ObjectId → Sale | — | **Return** sale |
| `returnReason` | String | free text | **Return** sale |
| `refundMethod` | String | `"cash"` / `"card"` / `"credit"` | **Return** sale |

> `refundMethod: "credit"` means the refund reduces an outstanding client debt instead of
> handing cash back. For pay-later sales the debt reduction happens automatically regardless
> of which refundMethod is chosen.

### Sale Number format

| Type | Format | Example |
|------|--------|---------|
| Regular sale | `SL-{timestamp}-{random}` | `SL-1713300000000-A3B2C` |
| Return sale | `RT-{timestamp}-{random}` | `RT-1713400000000-X9Y2Z` |

---

## 3. Calculation Logic

All numbers are computed before any database write so that validation failures abort cleanly.

### Per item

```
itemReturnTotal  = item.sellingPrice  × returnQty
itemReturnCost   = item.originalPrice × returnQty
itemReturnProfit = itemReturnTotal − itemReturnCost
```

### Aggregated across all returned items

```
returnTotalAmount = Σ itemReturnTotal
returnTotalProfit = Σ itemReturnProfit
returnTotalCost   = Σ itemReturnCost
```

### Proportional discount

The original sale may have had a discount applied to the whole basket.
When returning a subset of that basket the same discount ratio is preserved
so neither the pharmacy nor the client is over- or under-charged.

```
discountFraction     = originalSale.discount / originalSale.totalAmount
proportionalDiscount = round(returnTotalAmount × discountFraction)
netRefund            = returnTotalAmount − proportionalDiscount
netProfit            = returnTotalProfit − proportionalDiscount
```

> If the original sale had **no discount**, `discountFraction = 0` and
> `netRefund = returnTotalAmount` exactly.

### What the return Sale document stores

The pre-save hook on `Sale` automatically recalculates `totalAmount`,
`totalProfit`, `totalCost`, and `finalAmount` from the items array, so:

```
returnSale.totalAmount  = returnTotalAmount
returnSale.discount     = proportionalDiscount    ← set explicitly
returnSale.finalAmount  = netRefund               ← calculated by hook
returnSale.totalProfit  = returnTotalProfit       ← calculated by hook
```

### Returnable quantity guard

```
maxReturnable = item.quantity − item.returnedQuantity
```

A request that asks for more than `maxReturnable` is rejected with `400` before
any stock or stat changes are made.

---

## 4. Endpoints

### 4.1 POST `/api/v1/sales/:id/return`

Process a return against an existing sale. Creates a new return Sale document,
restores stock, and reverses all related stats.

**Access:** owner, manager, employee

#### Request body fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | Array | ✅ | Items to return (min 1) |
| `items[].saleItemId` | ObjectId | ✅ | The `_id` of the item inside the original sale's `items` array |
| `items[].quantity` | Integer | ✅ | How many units to return (must be ≤ remaining returnable) |
| `refundMethod` | String | ❌ | `"cash"` (default) / `"card"` / `"credit"` |
| `reason` | String | ❌ | Why the return is happening |
| `notes` | String | ❌ | Extra notes |

---

### 4.2 GET `/api/v1/sales/:id/returns`

Returns all return transactions linked to a specific original sale.

**Access:** owner, manager, employee

No query parameters. Response always sorted newest first.

---

### 4.3 GET `/api/v1/sales?isReturn=true`

Filter the sales list to only return transactions (or only regular sales).

**Access:** owner, manager, employee

| Param | Value | Effect |
|-------|-------|--------|
| `isReturn=true` | `"true"` | Only return transactions (`RT-…`) |
| `isReturn=false` | `"false"` | Only regular sales (`SL-…`) |
| *(omitted)* | — | Both |

Can be combined with all existing filters (`cashier`, `client`, `startDate`, `endDate`, `page`, `limit`).

---

### 4.4 GET `/api/v1/sales/:id`

Existing endpoint — now also populates `originalSale` so a return sale shows
a reference to the sale it came from.

---

## 5. Worked Examples

### Scenario data used throughout

**Original sale** `SL-1713300000000-A3B2C`

```
Client : Ahmed Ali   (664abc123def456789000001)
Cashier: Sara        (664user000000000000000001)
Pharmacy: Main St    (664pharm00000000000000001)

Items:
  ┌─ saleItemId: 664item000000000000000001
  │  Amoxicillin 500mg — pack
  │  qty: 3   sellingPrice: 15,000   originalPrice: 9,000
  │  totalPrice: 45,000   profit: 18,000
  │
  └─ saleItemId: 664item000000000000000002
     Vitamin C 1000mg — pack
     qty: 2   sellingPrice: 8,500   originalPrice: 5,000
     totalPrice: 17,000   profit: 7,000

totalAmount : 62,000
discount    : 6,200   (10 % basket discount)
finalAmount : 55,800
totalProfit : 25,000   (before discount)
paymentMethod: "cash"
```

---

### 5.1 Full Return — Cash Refund

Client returns all 3 packs of Amoxicillin AND both packs of Vitamin C.

#### Request

```
POST /api/v1/sales/664sale000000000000000001/return
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "items": [
    { "saleItemId": "664item000000000000000001", "quantity": 3 },
    { "saleItemId": "664item000000000000000002", "quantity": 2 }
  ],
  "refundMethod": "cash",
  "reason": "Client changed mind, unopened boxes",
  "notes": "All packaging intact"
}
```

#### Calculations

```
Item 1 — Amoxicillin × 3
  itemReturnTotal  = 15,000 × 3 = 45,000
  itemReturnCost   =  9,000 × 3 = 27,000
  itemReturnProfit = 45,000 − 27,000 = 18,000

Item 2 — Vitamin C × 2
  itemReturnTotal  = 8,500 × 2 = 17,000
  itemReturnCost   = 5,000 × 2 = 10,000
  itemReturnProfit = 17,000 − 10,000 = 7,000

returnTotalAmount = 45,000 + 17,000 = 62,000
returnTotalProfit = 18,000 +  7,000 = 25,000

discountFraction     = 6,200 / 62,000 = 0.10
proportionalDiscount = round(62,000 × 0.10) = 6,200
netRefund            = 62,000 − 6,200 = 55,800
netProfit            = 25,000 − 6,200 = 18,800
```

#### Response `201`

```json
{
  "status": "success",
  "data": {
    "returnSale": {
      "_id": "664ret000000000000000001",
      "saleNumber": "RT-1713400000000-X9Y2Z",
      "pharmacy": "664pharm00000000000000001",
      "cashier": "664user000000000000000001",
      "client": "664abc123def456789000001",
      "isReturn": true,
      "originalSale": "664sale000000000000000001",
      "returnReason": "Client changed mind, unopened boxes",
      "refundMethod": "cash",
      "paymentMethod": "cash",
      "notes": "All packaging intact",
      "items": [
        {
          "_id": "664ritem00000000000000001",
          "product": "664prod000000000000000010",
          "productName": "Amoxicillin 500mg",
          "quantity": 3,
          "sellingPrice": 15000,
          "originalPrice": 9000,
          "totalPrice": 45000,
          "profit": 18000,
          "sellingMode": "pack",
          "returnedQuantity": 0
        },
        {
          "_id": "664ritem00000000000000002",
          "product": "664prod000000000000000011",
          "productName": "Vitamin C 1000mg",
          "quantity": 2,
          "sellingPrice": 8500,
          "originalPrice": 5000,
          "totalPrice": 17000,
          "profit": 7000,
          "sellingMode": "pack",
          "returnedQuantity": 0
        }
      ],
      "totalAmount": 62000,
      "discount": 6200,
      "finalAmount": 55800,
      "totalProfit": 25000,
      "totalCost": 37000,
      "returnStatus": "none",
      "createdAt": "2026-04-17T12:00:00.000Z"
    },
    "summary": {
      "originalSaleNumber": "SL-1713300000000-A3B2C",
      "originalSaleStatus": "full",
      "returnTotalAmount": 62000,
      "proportionalDiscount": 6200,
      "netRefund": 55800,
      "netProfit": 18800,
      "refundMethod": "cash"
    }
  }
}
```

#### What changed in the DB

```
Original sale SL-1713300000000-A3B2C:
  item[0].returnedQuantity : 0 → 3
  item[1].returnedQuantity : 0 → 2
  returnStatus             : "none" → "full"

Stock:
  Amoxicillin variant.quantityInStock  += 3
  Vitamin C   variant.quantityInStock  += 2

Stats reversed:
  User Sara   — totalSales   −55,800  |  totalProfit  −18,800
  Pharmacy    — totalRevenue −55,800  |  totalProfit  −18,800
  Amoxicillin — totalSold −3  |  totalRevenue −45,000  |  totalProfit −18,000
  Vitamin C   — totalSold −2  |  totalRevenue −17,000  |  totalProfit  −7,000
  Client Ahmed — totalSpent −55,800
```

---

### 5.2 Partial Return — Two Items, One Returned

Client returns only 1 of the 3 Amoxicillin packs. Vitamin C is kept.

#### Request

```
POST /api/v1/sales/664sale000000000000000001/return
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "items": [
    { "saleItemId": "664item000000000000000001", "quantity": 1 }
  ],
  "refundMethod": "cash",
  "reason": "One pack was damaged on delivery"
}
```

#### Calculations

```
Item 1 — Amoxicillin × 1
  itemReturnTotal  = 15,000 × 1 = 15,000
  itemReturnCost   =  9,000 × 1 =  9,000
  itemReturnProfit = 15,000 −  9,000 = 6,000

returnTotalAmount = 15,000
returnTotalProfit = 6,000

discountFraction     = 6,200 / 62,000 = 0.10
proportionalDiscount = round(15,000 × 0.10) = 1,500
netRefund            = 15,000 − 1,500 = 13,500
netProfit            = 6,000  − 1,500 = 4,500
```

#### Response `201`

```json
{
  "status": "success",
  "data": {
    "returnSale": {
      "saleNumber": "RT-1713400000001-B4K7M",
      "isReturn": true,
      "originalSale": "664sale000000000000000001",
      "returnReason": "One pack was damaged on delivery",
      "refundMethod": "cash",
      "items": [
        {
          "productName": "Amoxicillin 500mg",
          "quantity": 1,
          "sellingPrice": 15000,
          "totalPrice": 15000,
          "profit": 6000
        }
      ],
      "totalAmount": 15000,
      "discount": 1500,
      "finalAmount": 13500,
      "totalProfit": 6000
    },
    "summary": {
      "originalSaleNumber": "SL-1713300000000-A3B2C",
      "originalSaleStatus": "partial",
      "returnTotalAmount": 15000,
      "proportionalDiscount": 1500,
      "netRefund": 13500,
      "netProfit": 4500,
      "refundMethod": "cash"
    }
  }
}
```

#### What changed in the DB

```
Original sale SL-1713300000000-A3B2C:
  item[0].returnedQuantity : 0 → 1      (2 still returnable)
  item[1].returnedQuantity : 0 → 0      (unchanged)
  returnStatus             : "none" → "partial"

Stock:
  Amoxicillin variant.quantityInStock += 1

Stats reversed:
  User Sara   — totalSales   −13,500  |  totalProfit  −4,500
  Pharmacy    — totalRevenue −13,500  |  totalProfit  −4,500
  Amoxicillin — totalSold −1  |  totalRevenue −15,000  |  totalProfit −6,000
  Client Ahmed — totalSpent −13,500
```

---

### 5.3 Return from a Pay-Later Sale

Same scenario but the **original sale used `paymentMethod: "later"`**, so a `ClientDebt`
exists for it. Client returns 1 pack of Amoxicillin.

Assume the debt currently looks like this before the return:

```
ClientDebt for sale SL-1713300000000-A3B2C:
  originalAmount : 55,800
  currentAmount  : 55,800
  amountPaid     : 20,000   ← client already paid this much
  status         : "partial"
  remaining      : 35,800
```

#### Request

```
POST /api/v1/sales/664sale000000000000000001/return
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "items": [
    { "saleItemId": "664item000000000000000001", "quantity": 1 }
  ],
  "refundMethod": "credit",
  "reason": "Damaged box"
}
```

> `refundMethod: "credit"` signals the refund goes against the debt, not as physical cash.
> For pay-later sales the debt is **always** reduced regardless of `refundMethod`.

#### Calculations

Same as [5.2](#52-partial-return--two-items-one-returned):

```
netRefund = 13,500
```

Debt adjustment:
```
currentRemaining = currentAmount − amountPaid = 55,800 − 20,000 = 35,800
debtReduction    = min(netRefund, currentRemaining) = min(13,500, 35,800) = 13,500

debt.currentAmount = 55,800 − 13,500 = 42,300
debt.status        = "partial"        (amountPaid 20,000 < currentAmount 42,300)
Client.totalDebt  −= 13,500
```

#### Response `201`

```json
{
  "status": "success",
  "data": {
    "returnSale": {
      "saleNumber": "RT-1713400000002-C5L8N",
      "isReturn": true,
      "originalSale": "664sale000000000000000001",
      "returnReason": "Damaged box",
      "refundMethod": "credit",
      "paymentMethod": "later",
      "items": [
        {
          "productName": "Amoxicillin 500mg",
          "quantity": 1,
          "sellingPrice": 15000,
          "totalPrice": 15000,
          "profit": 6000
        }
      ],
      "totalAmount": 15000,
      "discount": 1500,
      "finalAmount": 13500,
      "totalProfit": 6000
    },
    "summary": {
      "originalSaleNumber": "SL-1713300000000-A3B2C",
      "originalSaleStatus": "partial",
      "returnTotalAmount": 15000,
      "proportionalDiscount": 1500,
      "netRefund": 13500,
      "netProfit": 4500,
      "refundMethod": "credit"
    }
  }
}
```

#### What changed in the DB

```
ClientDebt linked to SL-1713300000000-A3B2C:
  currentAmount : 55,800 → 42,300
  status        : "partial" (unchanged)
  notes         : "Return RT-1713400000002-C5L8N: −13500"

Client Ahmed:
  totalDebt    −= 13,500
  totalSpent   −= 13,500
```

---

### 5.4 Second Partial Return on Same Sale

After [5.2](#52-partial-return--two-items-one-returned) the original sale's
Amoxicillin item has `returnedQuantity: 1`, leaving 2 still returnable.
The client now comes back and returns the remaining 2 packs.

#### State of original sale before this request

```
item[0] Amoxicillin  qty: 3  returnedQuantity: 1  → maxReturnable: 2
item[1] Vitamin C    qty: 2  returnedQuantity: 0  → maxReturnable: 2
returnStatus: "partial"
```

#### Request

```
POST /api/v1/sales/664sale000000000000000001/return
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "items": [
    { "saleItemId": "664item000000000000000001", "quantity": 2 }
  ],
  "refundMethod": "cash",
  "reason": "Client returned remaining stock"
}
```

#### Calculations

```
Item 1 — Amoxicillin × 2
  itemReturnTotal  = 15,000 × 2 = 30,000
  itemReturnCost   =  9,000 × 2 = 18,000
  itemReturnProfit = 12,000

discountFraction     = 6,200 / 62,000 = 0.10
proportionalDiscount = round(30,000 × 0.10) = 3,000
netRefund            = 30,000 − 3,000 = 27,000
netProfit            = 12,000 − 3,000 = 9,000
```

#### Response `201`

```json
{
  "status": "success",
  "data": {
    "returnSale": {
      "saleNumber": "RT-1713400000003-D6P1Q",
      "isReturn": true,
      "items": [
        {
          "productName": "Amoxicillin 500mg",
          "quantity": 2,
          "sellingPrice": 15000,
          "totalPrice": 30000,
          "profit": 12000
        }
      ],
      "totalAmount": 30000,
      "discount": 3000,
      "finalAmount": 27000
    },
    "summary": {
      "originalSaleNumber": "SL-1713300000000-A3B2C",
      "originalSaleStatus": "partial",
      "returnTotalAmount": 30000,
      "proportionalDiscount": 3000,
      "netRefund": 27000,
      "netProfit": 9000,
      "refundMethod": "cash"
    }
  }
}
```

> `originalSaleStatus` is still `"partial"` because Vitamin C (`qty: 2`) has never been
> returned. Once Vitamin C is returned, status will flip to `"full"`.

---

### List all returns for a sale

```
GET /api/v1/sales/664sale000000000000000001/returns
Authorization: Bearer <token>
```

#### Response `200`

```json
{
  "status": "success",
  "results": 2,
  "data": {
    "returns": [
      {
        "_id": "664ret000000000000000002",
        "saleNumber": "RT-1713400000003-D6P1Q",
        "cashier": { "_id": "664user000000000000000001", "name": "Sara" },
        "isReturn": true,
        "originalSale": "664sale000000000000000001",
        "returnReason": "Client returned remaining stock",
        "refundMethod": "cash",
        "totalAmount": 30000,
        "discount": 3000,
        "finalAmount": 27000,
        "createdAt": "2026-04-19T09:00:00.000Z"
      },
      {
        "_id": "664ret000000000000000001",
        "saleNumber": "RT-1713400000001-B4K7M",
        "cashier": { "_id": "664user000000000000000001", "name": "Sara" },
        "isReturn": true,
        "originalSale": "664sale000000000000000001",
        "returnReason": "One pack was damaged on delivery",
        "refundMethod": "cash",
        "totalAmount": 15000,
        "discount": 1500,
        "finalAmount": 13500,
        "createdAt": "2026-04-18T14:00:00.000Z"
      }
    ]
  }
}
```

---

### View a return sale directly

```
GET /api/v1/sales/664ret000000000000000001
Authorization: Bearer <token>
```

```json
{
  "status": "success",
  "data": {
    "sale": {
      "_id": "664ret000000000000000001",
      "saleNumber": "RT-1713400000001-B4K7M",
      "isReturn": true,
      "originalSale": {
        "_id": "664sale000000000000000001",
        "saleNumber": "SL-1713300000000-A3B2C",
        "finalAmount": 55800,
        "createdAt": "2026-04-17T10:30:00.000Z"
      },
      "returnReason": "One pack was damaged on delivery",
      "refundMethod": "cash",
      "cashier": { "_id": "664user000000000000000001", "name": "Sara", "email": "sara@pharmacy.com" },
      "client": { "_id": "664abc123def456789000001", "name": "Ahmed Ali", "phone": "07701234567" },
      "items": [
        {
          "_id": "664ritem00000000000000001",
          "product": { "_id": "664prod000000000000000010", "name": "Amoxicillin 500mg", "barcode": "6223001234567" },
          "productName": "Amoxicillin 500mg",
          "quantity": 1,
          "sellingPrice": 15000,
          "originalPrice": 9000,
          "totalPrice": 15000,
          "profit": 6000,
          "sellingMode": "pack",
          "returnedQuantity": 0
        }
      ],
      "totalAmount": 15000,
      "discount": 1500,
      "finalAmount": 13500,
      "totalProfit": 6000,
      "createdAt": "2026-04-18T14:00:00.000Z"
    }
  }
}
```

---

## 6. Error Reference

### Trying to return a return transaction `400`

```json
{
  "status": "fail",
  "message": "Cannot process a return on a return transaction"
}
```

### Sale already fully returned `400`

```json
{
  "status": "fail",
  "message": "This sale has already been fully returned"
}
```

### No items provided `400`

```json
{
  "status": "fail",
  "message": "At least one item must be included in the return"
}
```

### Item ID not found on the sale `404`

```json
{
  "status": "fail",
  "message": "Sale item 664item000000000000000099 not found on this sale"
}
```

### Return quantity exceeds what is returnable `400`

```json
{
  "status": "fail",
  "message": "Cannot return 3 of \"Amoxicillin 500mg\". Already returned: 1, remaining returnable: 2"
}
```

### Zero or negative quantity `400`

```json
{
  "status": "fail",
  "message": "Return quantity must be a positive integer"
}
```

### Sale not found / wrong pharmacy `404`

```json
{
  "status": "fail",
  "message": "Sale not found"
}
```

---

## 7. Side Effects Reference

Every successful return triggers all of the following automatically.
Nothing needs to be called separately.

| Entity | Field | Change |
|--------|-------|--------|
| **Original Sale** | `items[n].returnedQuantity` | `+= returnQty` per item |
| **Original Sale** | `returnStatus` | `"none"` → `"partial"` or `"full"` |
| **Product variant** | `quantityInStock` | `+= returnQty` (exact variant restored) |
| **Product** | `totalSold` | `−= returnQty` |
| **Product** | `totalRevenue` | `−= itemReturnTotal` |
| **Product** | `totalProfit` | `−= itemReturnProfit` |
| **User (cashier of original sale)** | `totalSales` | `−= netRefund` |
| **User (cashier of original sale)** | `totalProfit` | `−= netProfit` |
| **Pharmacy** | `totalRevenue` | `−= netRefund` |
| **Pharmacy** | `totalProfit` | `−= netProfit` |
| **Client** | `totalSpent` | `−= netRefund` |
| **ClientDebt** *(pay-later only)* | `currentAmount` | `−= min(netRefund, remaining)` |
| **ClientDebt** *(pay-later only)* | `status` | `→ "paid"` if fully covered |
| **Client** *(pay-later only)* | `totalDebt` | `−= debtReduction` |
| **ActivityLog** | new record | action `"return"`, entityType `"Sale"` |

> The **cashier reversed** is always the cashier of the **original sale**, not whoever
> processes the return. This keeps individual performance stats accurate.
