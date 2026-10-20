const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('DATABASE_URL não definida. O servidor iniciará, mas as operações de banco falharão até a variável ser configurada.');
}

const isExternalDatabase = !!databaseUrl && !/localhost|127\.0\.0\.1/.test(databaseUrl);
const sslEnabled = process.env.DATABASE_SSL === 'true' || (isExternalDatabase && process.env.DATABASE_SSL !== 'false');
const pool = new Pool({
  connectionString: databaseUrl,
  // Keep certificate validation enabled whenever TLS is used.
  ssl: sslEnabled ? { rejectUnauthorized: true } : false
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool PostgreSQL:', err);
});

module.exports = pool;
