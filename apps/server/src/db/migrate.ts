import { migrateDatabase } from './migrations.js';

const connectionString = process.env.DATABASE_ADMIN_URL;
const appPassword = process.env.DATABASE_APP_PASSWORD;
if (!connectionString || !appPassword) {
  throw new Error('Migrations require DATABASE_ADMIN_URL and DATABASE_APP_PASSWORD.');
}

await migrateDatabase(connectionString, appPassword);
console.log('Database migrations complete.');
