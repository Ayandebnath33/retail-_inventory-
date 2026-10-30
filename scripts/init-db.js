require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  // The schema contains no stored procedures; execute each semicolon-delimited statement.
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) {
    await connection.query(statement);
  }
  await connection.query('USE retail_inventory');
  const [admins] = await connection.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (!admins.length) {
    const hash = await bcrypt.hash('Admin@12345', 12);
    await connection.query(
      'INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',
      ['System Administrator', 'admin@retail.local', hash, 'admin']
    );
    console.log('Created default admin: admin@retail.local / Admin@12345');
  } else {
    console.log('An administrator already exists; no default account was created.');
  }
  await connection.end();
  console.log('Database initialized successfully.');
}
main().catch(err => { console.error('Database initialization failed:', err.message); process.exit(1); });
