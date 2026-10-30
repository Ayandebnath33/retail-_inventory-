const router = require('express').Router();
const db = require('../config/db');
const asyncHandler = require('../utils/async-handler');

router.get('/dashboard', asyncHandler(async (req, res) => {
  const [[products]] = await db.query('SELECT COUNT(*) AS total_products FROM products WHERE is_active=1');
  const [[sales]] = await db.query(`SELECT COUNT(*) AS sales_today, COALESCE(SUM(total_amount),0) AS revenue_today
    FROM sales WHERE status='completed' AND DATE(created_at)=CURRENT_DATE()`);
  const [[stock]] = await db.query('SELECT COALESCE(SUM(quantity),0) AS units_in_stock FROM inventory');
  const [lowStock] = await db.query(
    `SELECT p.id,p.sku,p.name,p.reorder_level,COALESCE(SUM(i.quantity),0) AS quantity
     FROM products p LEFT JOIN inventory i ON i.product_id=p.id
     WHERE p.is_active=1 GROUP BY p.id
     HAVING quantity <= p.reorder_level ORDER BY quantity ASC LIMIT 20`
  );
  res.json({ ...products, ...sales, ...stock, low_stock: lowStock });
}));

router.get('/reports/sales', asyncHandler(async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  const to = req.query.to || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return res.status(400).json({ error: 'Provide valid from/to dates in YYYY-MM-DD format; from must not exceed to.' });
  }
  const [summary] = await db.execute(
    `SELECT COUNT(*) AS transaction_count, COALESCE(SUM(subtotal),0) AS subtotal,
      COALESCE(SUM(discount),0) AS discounts, COALESCE(SUM(total_amount),0) AS revenue
     FROM sales WHERE status='completed' AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from,to]
  );
  const [daily] = await db.execute(
    `SELECT DATE(created_at) AS sale_date, COUNT(*) AS transactions,
      SUM(total_amount) AS revenue FROM sales
     WHERE status='completed' AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY DATE(created_at) ORDER BY sale_date`,
    [from,to]
  );
  res.json({ from, to, summary: summary[0], daily });
}));

router.get('/reports/stock-movements', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT sm.*,p.sku,p.name AS product_name,w.name AS warehouse_name,u.name AS performed_by
     FROM stock_movements sm JOIN products p ON p.id=sm.product_id
     JOIN warehouses w ON w.id=sm.warehouse_id JOIN users u ON u.id=sm.user_id
     ORDER BY sm.id DESC LIMIT 500`
  );
  res.json(rows);
}));

module.exports = router;
