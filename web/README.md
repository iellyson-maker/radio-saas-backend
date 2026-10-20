# Qolan Studio Web 0.2.0

Console web local-first com módulos de operação, biblioteca, programação, comerciais, prova de veiculação, diagnóstico e configurações.

## Rodar localmente

Requer Node.js 20 ou superior.

Comandos: **npm install**, **npm run check**, **npm test**, **npm start**.

Acesse http://localhost:3000. Health endpoint: /health.

## Deploy

Use o Blueprint **render-qolan.yaml** na raiz ou crie manualmente um Web Service com repositório **iellyson-maker/radio-saas-backend**, branch **main**, Root Directory **web**, Build Command **npm install && npm run check && npm test**, Start Command **npm start**, health check **/health**.

## Funcionalidades da versão

- IndexedDB para persistir mídia, configurações, fila, eventos agendados, campanhas e logs no navegador local.
- Categoria de mídia editável, pesquisa e envio para fila.
- Fila reordenável.
- Player local com play/pause, stop, reiniciar, próximo e fade-out.
- Estimativa RMS L/R via Web Audio API.
- Rotação aleatória local sem repetir as últimas 10 faixas concluídas quando houver opções suficientes.
- Agenda local por dia/horário, ativada apenas com a automação ligada e página aberta; evento entra na fila, não corta uma faixa no meio para garantir instante exato.
- Cadastro de campanha com áudio spot, janela de datas, dia e horário; inserção entra na fila se a página estiver aberta.
- Registros locais de início, conclusão, interrupção e erro, com exportação CSV/JSON.
- Backup JSON de configurações/regras/registros. Arquivos de áudio devem ser copiados/importados separadamente.

## Limitações críticas

- Não existe login, autorização, isolamento multi-tenant ou sincronização entre navegadores.
- Áudio e logs ficam no browser atual. Limpar dados do navegador, exceder quota ou perder perfil pode apagar a biblioteca; mantenha cópias dos arquivos originais.
- Agenda não é garantida com aba suspensa, computador desligado ou navegador fechado.
- Não há motor de transmissão 24/7, streaming, fallback de emissão, clock hours determinístico, ingestão de mapas comerciais, logs de prova legal ou integração RDS/OBS/vMix.
- Não use como playout crítico ou como produto SaaS multiusuário até construir e testar o backend e a Qolan Engine.
