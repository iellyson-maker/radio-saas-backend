# Qolan Studio — Web

Primeira versão web do console Qolan Studio.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm run check
npm test
npm start
```

Acesse `http://localhost:3000`. Endpoint de saúde: `/health`.

## Deploy no Render

Use o arquivo **`render-qolan.yaml`** da raiz como caminho personalizado do Blueprint. Ele foi separado para criar apenas o serviço web gratuito sem aplicar por engano o Blueprint do backend SaaS existente. Acesse o repositório raiz e selecione esse caminho ao criar o Blueprint.

Configuração equivalente para criação manual de Web Service:
- Repositório: `iellyson-maker/radio-saas-backend`
- Branch: `main`
- Root Directory: `web`
- Build Command: `npm install && npm run check && npm test`
- Start Command: `npm start`
- Health Check Path: `/health`
- Plano: Free

## Limitações atuais — leia antes de usar

- É um MVP do console, não um serviço crítico de playout.
- Não há autenticação, banco remoto, autorização por emissora, multi-tenancy ou sincronização entre navegadores.
- Os arquivos são selecionados e tocados localmente pelo navegador; não são enviados para o servidor. A biblioteca/fila são mantidas apenas na memória da página e somem ao recarregar.
- O modo automático somente avança a fila enquanto a página está aberta; não é automação 24/7.
- Não há streaming Icecast/SHOUTcast nem logs de prova de veiculação persistentes.
- Não use arquivos privados nem exponha o serviço como SaaS multiusuário antes de implementar autenticação, banco, armazenamento de mídia, testes de autorização e observabilidade.
