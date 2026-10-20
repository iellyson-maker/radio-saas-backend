# Qolan Studio — plataforma de operação de rádio

Projeto da plataforma de automação de rádio, com o backend SaaS existente e uma primeira interface web em `web/`.

## Aplicação web

A interface Qolan Studio Web tem player no navegador, biblioteca local, fila, cartucheira e endpoint de saúde. Consulte [web/README.md](web/README.md) para execução, publicação e limitações.

**Estado atual:** MVP de console web. Os arquivos de áudio não são enviados ao servidor; não existe ainda autenticação SaaS, sincronização entre navegadores, transmissão ou automação 24/7.

## Deploy no Render

O Blueprint raiz `render.yaml` conserva a configuração existente do backend e banco e inclui um serviço separado `qolan-studio-web` com plano Free, diretório raiz `web`, checagens de sintaxe/testes no build e health check em `/health`.

Ao sincronizar o Blueprint no Render, revise os recursos detectados e confirme a criação do novo Web Service. O plano Free pode suspender o serviço após inatividade; isso não serve para execução de áudio 24/7.

## Backend

O backend Express e o schema PostgreSQL existentes permanecem na raiz. Consulte `schema.sql`, `organizations.js` e `db.js` para a estrutura atual.
