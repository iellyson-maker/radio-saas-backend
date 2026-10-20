# RadioOS Studio Web

MVP web do console RadioOS. Esta versão executa áudio no navegador atual e não é um serviço de transmissão 24/7.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Verificação: `npm run check`; health endpoint: `/health`.

## Deploy no Render

Crie um Web Service apontando para este repositório e configure Root Directory como `web`, Build Command `npm install`, Start Command `npm start`. O arquivo `render.yaml` também descreve o serviço.

## Limitações explícitas

- Não há login/autorização, banco de dados remoto nem multi-tenant.
- A biblioteca e fila vivem na memória da página; os arquivos importados são Object URLs locais e não são enviados ao servidor.
- Agenda/automação 24/7 e streaming não estão implementados. O modo automático é apenas avanço da fila enquanto a página está aberta.
- Não hospede dados privados nem use como playout crítico sem adicionar autenticação, persistência, testes e engine dedicada.
