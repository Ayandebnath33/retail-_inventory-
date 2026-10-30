const router = require('express').Router();
const db = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const { body, param } = require('express-validator');
const { validate } = require('../utils/validation');

function validItems(items) {
  return Array.isArray(items) && items.length > 0 && items.length <= 100 &&
    items.every(i => Number.isInteger(Number(i.product_id)) && Number(i.product_id) > 0 &&
      Number.isInteger(Number(i.quantity)) && Number(i.quantity) > 0 &&
      (i.unit_cost === undefined || (Number.isFinite(Number(i.unit_cost)) && Number(i.unit_cost) >= 0)));
}

router.get('/purchases', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, s.name AS supplier_name, w.name AS warehouse_name, u.name AS created_by
     FROM purchases p JOIN suppliers s ON s.id=p.supplier_id
     JOIN warehouses w ON w.id=p.warehouse_id JOIN users u ON u.id=p.user_id
     ORDER BY p.id DESC LIMIT 200`
  );
  res.json(rows);
}));

router.post('/purchases',
  body('supplier_id').isInt({ min: 1 }),
  body('warehouse_id').isInt({ min: 1 }),
  body('items').isArray({ min: 1, max: 100 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  validate,
  asyncHandler(async (req, res) => {
    const { supplier_id, warehouse_id, items, notes } = req.body;
    if (!validItems(items) || items.some(i => i.unit_cost === undefined)) {
      return res.status(400).json({ error: 'Each purchase item requires a positive product_id, positive integer quantity and non-negative unit_cost.' });
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let total = 0;
      const lines = [];
      for (const item of items) {
        const [products] = await conn.execute('SELECT id FROM products WHERE id=? AND is_active=1', [item.product_id]);
        if (!products.length) { const e = new Error(`Product ${item.product_id} not found or inactive`); e.status=400; throw e; }
        const cost = Number(item.unit_cost);
        const line = Math.round(cost * Number(item.quantity) * 100) / 100;
        total += line;
        lines.push({ product_id: Number(item.product_id), quantity: Number(item.quantity), unit_cost: cost, line_total: line });
      }
      total = Math.round(total * 100) / 100;
      const [p] = await conn.execute(
        'INSERT INTO purchases (supplier_id,warehouse_id,user_id,total_amount,notes) VALUES (?,?,?,?,?)',
        [supplier_id, warehouse_id, req.user.id, total, notes || null]
      );
      for (const line of lines) {
        await conn.execute(
          'INSERT INTO purchase_items (purchase_id,product_id,quantity,unit_cost,line_total) VALUES (?,?,?,?,?)',
          [p.insertId,line.product_id,line.quantity,line.unit_cost,line.line_total]
        );
        await conn.execute(
          `INSERT INTO inventory (product_id,warehouse_id,quantity) VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`,
          [line.product_id, warehouse_id, line.quantity]
        );
        await conn.execute(
          `INSERT INTO stock_movements
           (product_id,warehouse_id,user_id,movement_type,quantity,reference_type,reference_id,notes)
           VALUES (?,?,?,'IN',?,'purchase',?,?)`,
          [line.product_id,warehouse_id,req.user.id,line.quantity,p.insertId,notes || 'Purchase received']
        );
      }
      await conn.commit();
      res.status(201).json({ id: p.insertId, total_amount: total, items: lines.length, status: 'received' });
    } catch (err) {
      await conn.rollback(); throw err;
    } finally { conn.release(); }
  })
);

router.get('/sales', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT s.*, COALESCE(c.name,'Walk-in customer') AS customer_name,
      w.name AS warehouse_name, u.name AS created_by
     FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
     JOIN warehouses w ON w.id=s.warehouse_id JOIN users u ON u.id=s.user_id
     ORDER BY s.id DESC LIMIT 200`
  );
  res.json(rows);
}));

router.post('/sales',
  body('warehouse_id').isInt({ min: 1 }),
  body('customer_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('discount').optional().isFloat({ min: 0 }),
  body('payment_method').optional().isIn(['cash','card','upi','bank_transfer','other']),
  body('items').isArray({ min: 1, max: 100 }),
  validate,
  asyncHandler(async (req, res) => {
    const { warehouse_id, customer_id, items } = req.body;
    const discount = Number(req.body.discount || 0);
    if (!validItems(items) || items.some(i => i.product_id == null || i.quantity == null)) {
      return res.status(400).json({ error: 'Each sale item requires a valid product_id and positive integer quantity.' });
    }
    const grouped = new Map();
    for (const item of items) {
      const id = Number(item.product_id);
      grouped.set(id, (grouped.get(id) || 0) + Number(item.quantity));
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const lines = [];
      let subtotal = 0;
      // Lock in ascending product order to reduce deadlock risk.
      for (const [productId, quantity] of [...grouped.entries()].sort((a,b) => a[0]-b[0])) {
        const [products] = await conn.execute(
          'SELECT id,name,selling_price FROM products WHERE id=? AND is_active=1',
          [productId]
        );
        if (!products.length) { const e = new Error(`Product ${productId} not found or inactive`); e.status=400; throw e; }
        const [stocks] = await conn.execute(
          'SELECT quantity FROM inventory WHERE product_id=? AND warehouse_id=? FOR UPDATE',
          [productId, warehouse_id]
        );
        if (!stocks.length || stocks[0].quantity < quantity) {
          const e = new Error(`Insufficient stock for ${products[0].name}. Available: ${stocks[0]?.quantity || 0}, requested: ${quantity}`);
          e.status = 409; throw e;
        }
        const price = Number(products[0].selling_price);
        const lineTotal = Math.round(price * quantity * 100) / 100;
        subtotal += lineTotal;
        lines.push({ product_id: productId, quantity, unit_price: price, line_total: lineTotal });
      }
      subtotal = Math.round(subtotal * 100) / 100;
      if (discount > subtotal) { const e = new Error('Discount cannot exceed subtotal.'); e.status=400; throw e; }
      const total = Math.round((subtotal - discount) * 100) / 100;
      const [sale] = await conn.execute(
        `INSERT INTO sales (customer_id,warehouse_id,user_id,subtotal,discount,total_amount,payment_method)
         VALUES (?,?,?,?,?,?,?)`,
        [customer_id || null,warehouse_id,req.user.id,subtotal,discount,total,req.body.payment_method || 'cash']
      );
      for (const line of lines) {
        await conn.execute(
          'INSERT INTO sale_items (sale_id,product_id,quantity,unit_price,line_total) VALUES (?,?,?,?,?)',
          [sale.insertId,line.product_id,line.quantity,line.unit_price,line.line_total]
        );
        await conn.execute(
          'UPDATE inventory SET quantity=quantity-? WHERE product_id=? AND warehouse_id=?',
          [line.quantity,line.product_id,warehouse_id]
        );
        await conn.execute(
          `INSERT INTO stock_movements
           (product_id,warehouse_id,user_id,movement_type,quantity,reference_type,reference_id,notes)
           VALUES (?,?,?,'OUT',?,'sale',?,'Sale completed')`,
          [line.product_id,warehouse_id,req.user.id,line.quantity,sale.insertId]
        );
      }
      await conn.commit();
      res.status(201).json({ id: sale.insertId, subtotal, discount, total_amount: total, status: 'completed' });
    } catch (err) {
      await conn.rollback(); throw err;
    } finally { conn.release(); }
  })
);

module.exports = router;
