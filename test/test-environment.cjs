const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parse } = require('dotenv');

function loadPostgresTestEnvironment() {
  const values = parse(readFileSync(resolve(__dirname, '..', '.env.test')));
  const raw = values.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL falta en .env.test');
  const url = new URL(raw);
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    url.hostname !== 'localhost' ||
    url.port !== '5433' ||
    url.pathname !== '/h3ga_finanzas_test' ||
    url.searchParams.get('schema') !== 'public'
  ) {
    throw new Error('I3 solo permite PostgreSQL localhost:5433/h3ga_finanzas_test?schema=public');
  }
  process.env.DATABASE_URL = raw;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = values.JWT_SECRET && values.JWT_SECRET.length >= 32
    ? values.JWT_SECRET
    : 'i3-postgres-test-secret-with-at-least-32-chars';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.SWAGGER_ENABLED = 'false';
  process.env.STORAGE_PROVIDER = 'local';
  process.env.LOCAL_STORAGE_PATH = './storage/postgres-tests';
  process.env.H3GA_I3_TEST_DATABASE_VERIFIED = '1';
  return { host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), schema: 'public' };
}

module.exports = { loadPostgresTestEnvironment };

loadPostgresTestEnvironment();
