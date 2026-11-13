import { createDatabase } from './client.js';
import { seedIfEmpty } from './seed.js';

if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required.');
const database = createDatabase(process.env.DATABASE_ADMIN_URL);
try {
  console.log((await seedIfEmpty(database)) ? 'Demo data seeded.' : 'Existing demo data preserved.');
} finally {
  await database.pool.end();
}
