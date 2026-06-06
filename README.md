# Restaurant SaaS API

A multi-tenant restaurant operations platform. Each restaurant is an isolated
tenant with its own meals, plans, subscribers, branches, drivers and daily meal
dispatch — new restaurants are onboarded with config + seed data, no code
changes. The first tenant is **Diet Food**, a diet-meal restaurant in Baghdad
with two branches.

## Stack

- **Node.js** + **Express** — HTTP API
- **MongoDB** + **Mongoose** — data layer
- **JWT** — authentication

## Setup

```bash
git clone <repo>
cd pharmacy-backend
npm install
cp .env.example config.env
```

Then edit `config.env` and set at least:

- `MONGODB_URI` — your MongoDB connection string
- `JWT_SECRET` — a long random secret

## Seed

Load the full Diet Food tenant (branches, plans, categories, meals, staff,
drivers, customers, subscriptions, today's meals and historical orders). The
script is idempotent:

```bash
npm run seed:dietfood
```

## Run (development)

```bash
npm run dev
```

## API base

```
http://localhost:5000/api/v1
```

## Multi-tenancy

Every `/api/v1` request (except `/api/v1/auth/login`, `/api/v1/auth/register`,
password reset, `/api/v1/public/*`, `/api/v1/super-admin/*` and `/health`) must
resolve a tenant. Provide it one of two ways:

- **Header (dev / API tools):** `x-tenant: dietfood`
- **Subdomain (production):** `https://dietfood.yourdomain.io` →
  resolves to the `dietfood` tenant.

## Test login

```http
POST /api/v1/auth/login
x-tenant: dietfood
Content-Type: application/json

{ "email": "admin@dietfood.iq", "password": "password123" }
```

Other seeded accounts (all `password123`): `manager@dietfood.iq`,
`kitchen@dietfood.iq`, `dispatcher@dietfood.iq`, `cashier@dietfood.iq`,
`driver1@dietfood.iq` … `driver3@dietfood.iq`, and `customer1@example.com` …
`customer30@example.com`.

## Health check

```
GET /health  →  { "status": "ok", "timestamp": ..., "version": "1.0.0" }
```
