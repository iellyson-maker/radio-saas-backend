require('dotenv').config();
const express = require('express');
const cors = require('cors');

const organizationsRouter = require('./routes/organizations');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota de saúde - útil para o Render checar se o serviço está de pé
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/organizations', organizationsRouter);

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
