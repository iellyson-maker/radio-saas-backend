# Qolan Studio — plataforma de operação de rádio

Projeto do Qolan Studio: uma plataforma híbrida para gestão de emissoras, console web e futura engine local de playout.

## Aplicação web

A primeira aplicação está em **web/**. Inclui console de operação, biblioteca persistida localmente no navegador, fila, cartucheira, programação e campanhas locais, diagnóstico e exportação de registros.

**Estado atual: MVP web local-first.** Ainda não há autenticação SaaS, sincronização multiusuário, object storage, engine Windows 24/7 ou streaming. A página web não deve ser usada como transmissor principal de uma rádio.

## Publicação no Render

O arquivo **render-qolan.yaml** configura o serviço web **qolan-studio-web** no plano Free, no diretório **web**, com validação de sintaxe, teste HTTP de fumaça e health check.

## Plano de evolução

Consulte **docs/PRODUCT_STRATEGY.md** para a análise competitiva, arquitetura-alvo, fases e critérios de aceite.

## Backend existente

O backend e o schema PostgreSQL prévios permanecem na raiz do repositório. A integração de autenticação, banco e armazenamento com o console web ainda precisa ser implementada e auditada antes de virar um SaaS multiusuário.
