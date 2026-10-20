# Qolan Studio — Web

Primeira versão web do Qolan Studio, projeto de console para operação de áudio de rádio.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm run check
npm test
npm start
```

Acesse `http://localhost:3000`. Endpoint de saúde: `/health`.

## Publicar no Render

Há uma configuração inicial em `render.yaml`. Ela descreve o Web Service com diretório raiz `web`, comando de build `npm install`, comando de início `npm start` e health check `/health`. Se o painel Render não detectar o Blueprint nesse caminho, crie um Web Service manual apontando o repositório para Root Directory `web`.

## Limitações atuais — leia antes de usar

- É um MVP do console, não um serviço crítico de playout.
- Não há autenticação, banco remoto, autorização por emissora, multi-tenancy ou sincronização entre navegadores.
- Os arquivos são selecionados e tocados localmente pelo navegador; não são enviados para o servidor. A biblioteca/fila são mantidas apenas na memória da página e somem ao recarregar.
- O modo automático somente avança a fila enquanto a página está aberta; não é automação 24/7.
- Não há streaming Icecast/SHOUTcast nem logs de prova de veiculação persistentes.
- Não coloque arquivos privados nem exponha o serviço como produto SaaS multiusuário antes de implementar autenticação, banco, armazenamento de mídia, testes de autorização e observabilidade.
