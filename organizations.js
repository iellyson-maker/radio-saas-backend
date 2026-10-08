const express = require('express');
const router = express.Router();
const pool = require('./db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug, plan, status, created_at FROM organizations ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar organizações' });
  }
});

router.post('/', async (req, res) => {
  const { name, slug } = req.body;

  if (typeof name !== 'string' || !name.trim() ||
      typeof slug !== 'string' || !slug.trim()) {
    return res.status(400).json({ error: 'name e slug são obrigatórios' });
  }

  const normalizedName = name.trim();
  const normalizedSlug = slug.trim().toLowerCase();

  try {
    const result = await pool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug, plan, status, timezone, created_at, updated_at`,
      [normalizedName, normalizedSlug]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);

    if (err.code === '23505') {
      return res.status(409).json({ error: 'slug já está em uso' });
    }

    res.status(500).json({ error: 'Erro ao criar organização' });
  }
});

module.exports = router;
