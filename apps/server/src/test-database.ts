import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrations.js';

// Every integration suite gets an empty disposable database; never reset the demo.
export async function testDatabase() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const applicationUrl = process.env.DATABASE_URL;
  const password = process.env.DATABASE_APP_PASSWORD;
  if (!adminUrl || !applicationUrl || !password)
    throw new Error('Integration tests require configured local PostgreSQL.');
  const name = `northbook_test_${randomUUID().replaceAll('-', '')}`;
  const control = new pg.Client({ connectionString: adminUrl });
  await control.connect();
  await control.query(`CREATE DATABASE "${name}"`);
  const ownerConnection = new URL(adminUrl);
  ownerConnection.pathname = `/${name}`;
  const appConnection = new URL(applicationUrl);
  appConnection.pathname = `/${name}`;
  const owner = createDatabase(ownerConnection.toString());
  const database = createDatabase(appConnection.toString());
  const close = async () => {
    if (!database.pool.ended) await database.pool.end();
    if (!owner.pool.ended) await owner.pool.end();
    await control.query(`DROP DATABASE "${name}"`);
    await control.end();
  };
  try {
    await migrateDatabase(ownerConnection.toString(), password);
    return { database, owner, close };
  } catch (error) {
    await close();
    throw error;
  }
}
