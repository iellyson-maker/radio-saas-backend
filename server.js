require('dotenv').config();
const express = require('express');
const { timingSafeEqual } = require('node:crypto');
const cors = require('cors');
const path = require('path');

const organizationsRouter = require('./organizations');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  optionsSuccessStatus: 204
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'radio-saas-backend'
  });
});

app.use(express.static(path.join(__dirname, 'public')));
function requireAdminToken(req, res, next) {
  const expected = process.env.API_ADMIN_TOKEN || "";
  if (expected.length < 32) {
    return res.status(503).json({ error: 'API administrativa desativada: configure API_ADMIN_TOKEN com pelo menos 32 caracteres.' });
  }
  const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Token administrativo ausente ou inválido.' });
  }
  return next();
}
app.use('/organizations', requireAdminToken, organizationsRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}
module.exports = { app, requireAdminToken };
