const router = require('express').Router();
const db = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const { body, param } = require('express-validator');
const { validate } = require('../utils/validation');
const { requireAdmin } = require('../middleware/auth');

const resources = {
  categories: {
    table: 'categories', fields: ['name','description'],
    rules: [body('name').trim().isLength({ min: 1, max: 120 }), body('description').optional({ nullable: true }).isString().isLength({ max: 500 })]
  },
  suppliers: {
    table: 'suppliers', fields: ['name','contact_person','email','phone','address'],
    rules: [body('name').trim().isLength({ min: 1, max: 160 }), body('contact_person').optional({ nullable: true }).isString().isLength({ max: 120 }), body('email').optional({ nullable: true, checkFalsy: true }).isEmail(), body('phone').optional({ nullable: true }).isString().isLength({ max: 40 }), body('address').optional({ nullable: true }).isString().isLength({ max: 500 })]
  },
  warehouses: {
    table: 'warehouses', fields: ['name','address'],
    rules: [body('name').trim().isLength({ min: 1, max: 120 }), body('address').optional({ nullable: true }).isString().isLength({ max: 500 })]
  },
  customers: {
    table: 'customers', fields: ['name','email','phone','address'],
    rules: [body('name').trim().isLength({ min: 1, max: 160 }), body('email').optional({ nullable: true, checkFalsy: true }).isEmail(), body('phone').optional({ nullable: true }).isString().isLength({ max: 40 }), body('address').optional({ nullable: true }).isString().isLength({ max: 500 })]
  }
};

for (const [resource, cfg] of Object.entries(resources)) {
  router.get(`/${resource}`, asyncHandler(async (req, res) => {
    const [rows] = await db.query(`SELECT * FROM ${cfg.table} ORDER BY id DESC LIMIT 500`);
    res.json(rows);
  }));
  router.post(`/${resource}`, cfg.rules, validate, asyncHandler(async (req, res) => {
    const fields = cfg.fields.filter(f => req.body[f] !== undefined);
    const values = fields.map(f => req.body[f] === '' ? null : req.body[f]);
    const [result] = await db.query(
      `INSERT INTO ${cfg.table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
      values
    );
    const [rows] = await db.query(`SELECT * FROM ${cfg.table} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  }));
}

router.get('/products', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const [rows] = await db.execute(
    `SELECT p.*, c.name AS category_name,
      COALESCE(SUM(i.quantity),0) AS stock_quantity
     FROM products p LEFT JOIN categories c ON c.id=p.category_id
     LEFT JOIN inventory i ON i.product_id=p.id
     WHERE (? = '' OR p.name LIKE ? OR p.sku LIKE ?)
     GROUP BY p.id ORDER BY p.id DESC LIMIT 500`,
    [search, `%${search}%`, `%${search}%`]
  );
  res.json(rows);
}));

const productRules = [
  body('sku').trim().isLength({ min: 1, max: 80 }),
  body('name').trim().isLength({ min: 1, max: 180 }),
  body('category_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('cost_price').isFloat({ min: 0, max: 999999999 }),
  body('selling_price').isFloat({ min: 0, max: 999999999 }),
  body('reorder_level').optional().isInt({ min: 0, max: 2147483647 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 1000 })
];

router.post('/products', requireAdmin, productRules, validate, asyncHandler(async (req, res) => {
  const b = req.body;
  const [r] = await db.execute(
    `INSERT INTO products (sku,name,category_id,description,cost_price,selling_price,reorder_level)
     VALUES (?,?,?,?,?,?,?)`,
    [b.sku, b.name, b.category_id || null, b.description || null, b.cost_price, b.selling_price, b.reorder_level || 0]
  );
  const [rows] = await db.execute('SELECT * FROM products WHERE id=?', [r.insertId]);
  res.status(201).json(rows[0]);
}));

router.put('/products/:id', requireAdmin,
  param('id').isInt({ min: 1 }), ...productRules, validate,
  asyncHandler(async (req, res) => {
    const b = req.body;
    await db.execute(
      `UPDATE products SET sku=?,name=?,category_id=?,description=?,cost_price=?,selling_price=?,reorder_level=?
       WHERE id=?`,
      [b.sku,b.name,b.category_id || null,b.description || null,b.cost_price,b.selling_price,b.reorder_level || 0,req.params.id]
    );
    const [rows] = await db.execute('SELECT * FROM products WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  })
);

router.delete('/products/:id', requireAdmin, param('id').isInt({ min: 1 }), validate,
  asyncHandler(async (req, res) => {
    await db.execute('DELETE FROM products WHERE id=?', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
