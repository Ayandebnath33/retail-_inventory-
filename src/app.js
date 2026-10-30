const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { authenticate } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', authenticate);
app.use('/api', require('./routes/master-data'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api', require('./routes/transactions'));
app.use('/api', require('./routes/reports'));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
