require('dotenv').config();
const app = require('./app');
const db = require('./config/db');
const port = Number(process.env.PORT || 3000);

async function start() {
  await db.query('SELECT 1');
  app.listen(port, () => console.log(`Retail Inventory System running at http://localhost:${port}`));
}
start().catch(err => {
  console.error('Could not start application. Check database configuration.', err.message);
  process.exit(1);
});
