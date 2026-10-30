function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A record with this unique value already exists.' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'A referenced record does not exist.' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'This record is referenced by transactions and cannot be deleted.' });
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
}

module.exports = { notFound, errorHandler };
