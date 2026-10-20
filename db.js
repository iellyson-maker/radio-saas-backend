const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('DATABASE_URL não definida. O servidor iniciará, mas as operações de banco falharão até a variável ser configurada.');
}

const isExternalDatabase = !!databaseUrl && (() => {
  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return !["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch (_) {
    return true;
  }
})();
const sslEnabled = isExternalDatabase || process.env.DATABASE_SSL === 'true';
const pool = new Pool({
  connectionString: databaseUrl,
  // Keep certificate validation enabled whenever TLS is used.
  ssl: sslEnabled ? { rejectUnauthorized: true } : false
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool PostgreSQL:', err);
});

module.exports = pool;
