const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
}

function positiveId(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

module.exports = { validate, positiveId };
