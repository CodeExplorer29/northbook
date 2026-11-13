import { defineRailway, github, postgres, preserve, project, service } from 'railway/iac';

// Set this non-secret variable when the owner has created the repository.
const repository = process.env.NORTHBOOK_GITHUB_REPOSITORY ?? 'YOUR_GITHUB_OWNER/northbook';

export default defineRailway(() => {
  const database = postgres('postgres');
  const server = service('server', {
    source: github(repository, { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.server' },
    start: 'node apps/server/dist/index.js',
    preDeploy: 'node apps/server/dist/db/migrate.js',
    healthcheck: '/api/healthz',
    healthcheckTimeout: 60,
    replicas: 1,
    deploy: { sleepApplication: false },
    domains: [],
    tcp: [],
    env: {
      PORT: '3001',
      SERVER_HOST: '::',
      PRICING_MODE: 'replay',
      DATABASE_ADMIN_URL: database.env.DATABASE_URL,
      DATABASE_URL: preserve(),
      DATABASE_APP_PASSWORD: preserve(),
      SESSION_SECRET: preserve(),
      PROXY_SECRET: preserve(),
    },
  });
  const web = service('web', {
    source: github(repository, { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.web' },
    start: 'node apps/web/server.js',
    healthcheck: '/healthz',
    env: {
      PORT: '3000',
      CLIENT_IP_SOURCE: 'railway',
      PROXY_SECRET: server.env.PROXY_SECRET,
      API_HOST: server.env.RAILWAY_PRIVATE_DOMAIN,
      API_PORT: '3001',
    },
  });
  return project('northbook', { resources: [database, server, web] });
});
