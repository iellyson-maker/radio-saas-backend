# Qolan Studio — plataforma de operação de rádio

Projeto da plataforma de automação de rádio, com o backend SaaS existente e a primeira interface web em `web/`.

## Aplicação web

A interface Qolan Studio Web tem player no navegador, biblioteca local, fila e cartucheira. Consulte [web/README.md](web/README.md) para execução, publicação e limitações.

**Estado atual:** MVP de console web. Os arquivos de áudio não são enviados ao servidor; não existe ainda autenticação SaaS, sincronização entre navegadores, transmissão ou automação 24/7.

## Deploy da interface Qolan Studio no Render

Para criar somente a interface web sem provisionar os recursos existentes do backend, use o arquivo **`render-qolan.yaml`** como caminho personalizado do Blueprint. Ele cria o serviço `qolan-studio-web` no plano Free, com diretório raiz `web`, validação/teste no build e health check em `/health`.

Render aceita escolher um caminho personalizado para o arquivo Blueprint durante a configuração: [documentação oficial de Blueprints](https://render.com/docs/infrastructure-as-code). Não selecione o Blueprint raiz `render.yaml` para uma instalação apenas web: ele define também o backend e o PostgreSQL existentes, ambos configurados no plano Starter.

O plano Free pode suspender o serviço depois de inatividade; por isso esta versão não é adequada para operação de rádio 24/7.

## Backend SaaS existente

O backend Express e o schema PostgreSQL foram mantidos. O arquivo `render.yaml` original foi preservado para não mudar ou recriar os recursos já definidos para o backend.
