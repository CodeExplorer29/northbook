import { expect, it, vi } from 'vitest';
const { end } = vi.hoisted(() => ({ end: vi.fn(async () => {}) }));
vi.mock('pg', () => ({
  default: {
    Client: class {
      connect() {
        throw Object.assign(new Error('driver detail with test-only-private-value'), {
          where: 'expanded SQL with test-only-private-value',
        });
      }
      end = end;
    },
  },
}));
import { migrateDatabase } from './migrations.js';
it('does not expose driver context or credentials from migration failures', async () => {
  let caught: unknown;
  try {
    await migrateDatabase('postgresql://example.invalid/demo', 'test-only-private-value');
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String(caught)).toBe(
    'Error: Database migration failed. Check database access and migration history.',
  );
  expect(caught).not.toHaveProperty('cause');
  expect(caught).not.toHaveProperty('where');
  expect(end).toHaveBeenCalledOnce();
});
