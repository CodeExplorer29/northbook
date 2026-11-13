import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

if (!existsSync('.env')) {
  const ownerPassword = randomBytes(24).toString('hex');
  const appPassword = randomBytes(24).toString('hex');
  const values = {
    SESSION_SECRET: randomBytes(32).toString('hex'),
    POSTGRES_PASSWORD: ownerPassword,
    DATABASE_APP_PASSWORD: appPassword,
    DATABASE_ADMIN_URL: `postgresql://northbook_owner:${ownerPassword}@127.0.0.1:55432/northbook`,
    DATABASE_URL: `postgresql://northbook_app:${appPassword}@127.0.0.1:55432/northbook`,
  };
  const template = readFileSync('.env.example', 'utf8');
  const localEnvironment = template.replace(/^(\w+)=$/gm, (line, key) =>
    key in values ? `${key}=${values[key]}` : line,
  );
  writeFileSync('.env', localEnvironment, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with local credentials.');
}

loadEnvFile('.env');
// A fresh process-only proxy secret is shared by both local child processes.
if (!process.env.PROXY_SECRET) process.env.PROXY_SECRET = randomBytes(32).toString('hex');

for (const name of ['POSTGRES_PASSWORD', 'DATABASE_URL', 'DATABASE_ADMIN_URL', 'DATABASE_APP_PASSWORD']) {
  if (!process.env[name]) throw new Error(`Set ${name} in .env before starting.`);
}

execFileSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], { stdio: 'inherit' });
execFileSync('pnpm', ['db:migrate'], { stdio: 'inherit' });
execFileSync('pnpm', ['--filter', '@northbook/shared', 'build'], { stdio: 'inherit' });

const apps = spawn('pnpm', ['dev:apps'], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => apps.kill(signal));
}
apps.once('exit', (code) => {
  process.exitCode = code ?? 0;
});
