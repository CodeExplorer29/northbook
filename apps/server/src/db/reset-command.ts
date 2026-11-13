import { resetWithOwner } from './reset.js';
if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required.');
await resetWithOwner(process.env.DATABASE_ADMIN_URL)();
console.log('Demo data restored.');
