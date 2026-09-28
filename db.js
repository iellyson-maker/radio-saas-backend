const { Pool } = require('pg');

// No Render, a variável DATABASE_URL é injetada automaticamente quando
// você conecta o web service ao banco PostgreSQL pelo dashboard (ou via render.yaml).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

module.exports = pool;
