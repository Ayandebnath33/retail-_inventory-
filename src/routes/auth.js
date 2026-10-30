const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../utils/validation');

router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 1, max: 200 }),
  validate,
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT id,name,email,password_hash,role,is_active FROM users WHERE email = ? LIMIT 1',
      [req.body.email]
    );
    const user = rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'development-only-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  })
);

module.exports = router;
