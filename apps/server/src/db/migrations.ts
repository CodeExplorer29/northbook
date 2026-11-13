import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export async function migrateDatabase(connectionString: string, appPassword: string) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query("SELECT set_config('northbook.app_password', $1, false)", [appPassword]);
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL('../../drizzle/', import.meta.url)),
    });
  } catch {
    // PostgreSQL can include expanded role-password SQL in an error context.
    // Never propagate that driver object to CLI or startup error output.
    throw new Error('Database migration failed. Check database access and migration history.');
  } finally {
    await client.end();
  }
}
