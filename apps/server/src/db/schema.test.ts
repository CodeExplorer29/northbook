import { afterAll, beforeAll, expect, it } from 'vitest';
import { testDatabase } from '../test-database.js';
import { seedIfEmpty } from './seed.js';
import { organisations, users } from './schema.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  fixture = await testDatabase();
});
afterAll(async () => {
  await fixture?.close();
});

it('migrates and seeds an empty database, preserving data on a second seed', async () => {
  expect(await fixture.owner.db.select().from(organisations)).toEqual([]);
  expect(await seedIfEmpty(fixture.owner)).toBe(true);
  expect(await seedIfEmpty(fixture.owner)).toBe(false);
  const orgs = await fixture.database.db.select().from(organisations);
  expect(orgs).toHaveLength(3);
  expect(orgs.filter((org) => org.kybState === 'approved')).toHaveLength(2);
  const personas = await fixture.database.db.select().from(users);
  expect(personas).toHaveLength(4);
  expect(personas.filter((user) => user.role === 'staff')).toHaveLength(1);
});

it('keeps the application role unable to run DDL and enforces identity integrity', async () => {
  await expect(
    fixture.database.pool.query('CREATE TABLE public.forbidden_ddl (id int)'),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    fixture.database.pool.query("INSERT INTO users(id,name,role) VALUES ('invalid','Invalid','client')"),
  ).rejects.toMatchObject({ code: '23514' });
});
