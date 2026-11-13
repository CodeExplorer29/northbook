process.env.HOSTNAME = process.env.WEB_HOST ?? '127.0.0.1';
await import('../apps/web/.next/standalone/apps/web/server.js');
