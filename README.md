# Radio SaaS — Backend

Plataforma SaaS de automação de programação para emissoras de rádio.

## Estrutura

```
src/
  server.js          → ponto de entrada do servidor Express
  db.js              → conexão com o PostgreSQL
  routes/
    organizations.js → CRUD de emissoras (organizações)
schema.sql            → schema completo do banco de dados
render.yaml            → configuração de deploy automático no Render
```

## Como subir para o GitHub

```bash
git init
git add .
git commit -m "Estrutura inicial do backend"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

## Como conectar no Render

1. No dashboard do Render, clique em **New** → **Blueprint**
2. Selecione o repositório que você acabou de criar no GitHub
3. O Render vai ler o `render.yaml` automaticamente e propor a criação do banco `radio-saas-db` e do serviço web `radio-saas-backend`
4. Clique em **Apply** — ele cria tudo e já conecta a `DATABASE_URL` do banco no serviço web sozinho

## Como aplicar o schema no banco

Depois que o banco estiver criado no Render, pegue a **External Connection String** dele (na página do banco, no dashboard) e rode localmente:

```bash
psql "SUA_CONNECTION_STRING_AQUI" -f schema.sql
```

## Rodando localmente (opcional, para testar antes de subir)

```bash
npm install
cp .env.example .env
# edite o .env com a connection string do banco
npm run dev
```

Depois acesse `http://localhost:3000/health` para confirmar que está no ar.
