import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../apps/web/', import.meta.url));
const standalone = `${webRoot}.next/standalone/apps/web/`;
cpSync(`${webRoot}.next/static`, `${standalone}.next/static`, { recursive: true });
if (existsSync(`${webRoot}public`)) cpSync(`${webRoot}public`, `${standalone}public`, { recursive: true });
