const router = require('express').Router();
const db = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const { body } = require('express-validator');
const { validate } = require('../utils/validation');

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT i.product_id, p.sku, p.name AS product_name, p.reorder_level,
      i.warehouse_id, w.name AS warehouse_name, i.quantity, i.updated_at
     FROM inventory i JOIN products p ON p.id=i.product_id
     JOIN warehouses w ON w.id=i.warehouse_id
     ORDER BY p.name,w.name`
  );
  res.json(rows);
}));

router.post('/transfer',
  body('product_id').isInt({ min: 1 }),
  body('from_warehouse_id').isInt({ min: 1 }),
  body('to_warehouse_id').isInt({ min: 1 }),
  body('quantity').isInt({ min: 1, max: 2147483647 }),
  validate,
  asyncHandler(async (req, res) => {
    const { product_id, from_warehouse_id, to_warehouse_id, quantity } = req.body;
    if (Number(from_warehouse_id) === Number(to_warehouse_id)) {
      return res.status(400).json({ error: 'Source and destination warehouses must differ.' });
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [sourceRows] = await conn.execute(
        'SELECT quantity FROM inventory WHERE product_id=? AND warehouse_id=? FOR UPDATE',
        [product_id, from_warehouse_id]
      );
      if (!sourceRows.length || sourceRows[0].quantity < quantity) {
        const err = new Error('Insufficient stock in source warehouse.');
        err.status = 409; throw err;
      }
      await conn.execute(
        'UPDATE inventory SET quantity=quantity-? WHERE product_id=? AND warehouse_id=?',
        [quantity, product_id, from_warehouse_id]
      );
      await conn.execute(
        `INSERT INTO inventory (product_id,warehouse_id,quantity) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`,
        [product_id, to_warehouse_id, quantity]
      );
      const [movement] = await conn.execute(
        `INSERT INTO stock_movements
         (product_id,warehouse_id,user_id,movement_type,quantity,reference_type,notes)
         VALUES (?,?,?,'TRANSFER_OUT',?,'transfer',?)`,
        [product_id, from_warehouse_id, req.user.id, quantity, `Transfer to warehouse ${to_warehouse_id}`]
      );
      const transferId = movement.insertId;
      await conn.execute(
        `INSERT INTO stock_movements
         (product_id,warehouse_id,user_id,movement_type,quantity,reference_type,reference_id,notes)
         VALUES (?,?,?,'TRANSFER_IN',?,'transfer',?,?)`,
        [product_id, to_warehouse_id, req.user.id, quantity, transferId, `Transfer from warehouse ${from_warehouse_id}`]
      );
      await conn.commit();
      res.status(201).json({ message: 'Stock transferred successfully', product_id, quantity });
    } catch (err) {
      await conn.rollback(); throw err;
    } finally { conn.release(); }
  })
);

module.exports = router;
