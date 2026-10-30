# Retail Inventory and Sales Management System

Academic project built with **Node.js, Express, MySQL, HTML, CSS and vanilla JavaScript**.

## Features

- JWT login with bcrypt password hashing and role-based access (`admin`, `staff`)
- Dashboard KPIs and low-stock report
- CRUD for categories, products, suppliers, warehouses and customers
- Purchase receiving increases stock
- Sales checkout locks stock rows, prevents negative inventory, and decreases stock atomically
- Warehouse transfers atomically move stock
- Immutable stock movement ledger for purchases, sales and transfers
- Sales and inventory reports
- Server-side validation, parameterized SQL, Helmet, and centralized error handling

## Requirements

- Node.js 18+
- MySQL 8+
- npm

## Setup

1. Create a database and tables:

   ```bash
   cp .env.example .env
   # Edit .env with your MySQL credentials and a strong JWT_SECRET
   npm install
   npm run db:init
   ```

   The initialization script creates the schema and a default administrator if no admin exists.

2. Default first-run login:

   - Email: `admin@retail.local`
   - Password: `Admin@12345`

   **Change this password immediately** after logging in. For a classroom/demo system, seed credentials are convenient; do not use them in production.

3. Start the server:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`.

## API overview

All endpoints are under `/api`. Except `/api/health` and `/api/auth/login`, endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Sign in |
| GET | `/api/dashboard` | Dashboard totals and low-stock items |
| GET/POST | `/api/categories` | List/create categories |
| GET/POST | `/api/products` | List/create products |
| PUT/DELETE | `/api/products/:id` | Update/delete product (delete restricted if referenced) |
| GET/POST | `/api/suppliers` | List/create suppliers |
| GET/POST | `/api/warehouses` | List/create warehouses |
| GET/POST | `/api/customers` | List/create customers |
| GET/POST | `/api/purchases` | List purchases / receive a purchase |
| GET/POST | `/api/sales` | List sales / checkout a sale |
| POST | `/api/inventory/transfer` | Transfer stock between warehouses |
| GET | `/api/inventory` | Current stock by product and warehouse |
| GET | `/api/reports/sales` | Sales totals over a date range |
| GET | `/api/reports/stock-movements` | Stock ledger |

## Example payloads

Create product:
```json
{
  "sku": "SKU-1001",
  "name": "Notebook A5",
  "category_id": 1,
  "cost_price": 25.00,
  "selling_price": 40.00,
  "reorder_level": 10
}
```

Receive a purchase:
```json
{
  "supplier_id": 1,
  "warehouse_id": 1,
  "items": [
    { "product_id": 1, "quantity": 20, "unit_cost": 25.00 }
  ],
  "notes": "Opening stock"
}
```

Checkout a sale:
```json
{
  "customer_id": null,
  "warehouse_id": 1,
  "discount": 0,
  "payment_method": "cash",
  "items": [
    { "product_id": 1, "quantity": 2 }
  ]
}
```

## Business logic and transaction safety

- Purchase receiving inserts a purchase and line items, upserts inventory, and records `IN` movements in one transaction.
- Sale checkout begins a transaction and locks each inventory row with `SELECT ... FOR UPDATE`. It checks availability, snapshots the current selling price, inserts the sale and lines, decrements stock, and records `OUT` movements. Any failure rolls the whole transaction back.
- Transfers lock the source inventory row and update both warehouse balances in one transaction.
- Inventory rows are unique per `(product_id, warehouse_id)`.
- Monetary values use `DECIMAL`; JavaScript calculations are rounded to two decimals. For a commercial system, consider using integer minor units or a decimal arithmetic library.
- Returns, purchase order approval, tax configuration, audit logs, pagination, password reset, and automated tests are useful future enhancements.

## Project structure

```text
retail-inventory-sales/
├── database/schema.sql
├── scripts/init-db.js
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/db.js
│   ├── middleware/auth.js
│   ├── middleware/errors.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── master-data.js
│   │   ├── inventory.js
│   │   ├── transactions.js
│   │   └── reports.js
│   └── utils/
│       ├── async-handler.js
│       └── validation.js
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Notes

This is a complete academic starter application, not a certified point-of-sale product. Test using a non-production database before using real inventory data.
