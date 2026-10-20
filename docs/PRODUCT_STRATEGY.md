# Qolan Studio — estratégia de produto e arquitetura

## Objetivo

Construir uma plataforma de operação de rádio híbrida (cloud + engine local), com foco inicial em emissoras brasileiras. O objetivo é superar o conjunto de recursos divulgado por soluções tradicionais, não reproduzir seus layouts, textos ou ativos visuais.

## Referência competitiva pública

A página oficial do Playlist Digital divulga automação 24/7, sorteio musical sem repetição, locuções automáticas, hora certa/temperatura, integração visual com OBS/vMix, tratamento de áudio e transições, gestão de redes/afiliadas, metadados RDS/streaming, permissões de operadores, logs e comprovações de veiculação, e operação remota. Fonte: https://playlistsolutions.com/playlist-digital/ . O manual público do fornecedor descreve programação, pré-escuta, QuickStart, mapas comerciais, grade musical, locuções, relógio operacional, operadores e disparos de rede: https://playlistsolutions.com/arquivos/manuais/Manual_Playlist_Digital_5.pdf .

Estes são recursos divulgados pelo fornecedor, não resultados de um teste independente da plataforma.

## Princípio de arquitetura do Qolan

- **Qolan Studio Web (control plane):** emissoras, usuários, configuração, biblioteca e metadados, agenda, campanhas, relatórios e observabilidade.
- **Qolan Engine (edge/local):** serviço local Windows responsável por playback, saídas de áudio, clock de programação, transições, fallback, armazenamento local e recuperação sem depender da internet.
- **Qolan Cloud API:** autenticação, isolamento por organização, sincronização e APIs com autorização por recurso.
- **Storage:** objetos de áudio em armazenamento apropriado para mídia; nunca depender do disco efêmero de um web service.
- **Streaming e distribuição:** encoder e servidores compatíveis, com reconexão, health checks e metadata.
- **Evidence layer:** logs append-only com id de mídia, emissora, origem de gatilho, horário agendado, início/término real, resultado e versão do engine.

A página web jamais deve ser descrita como um transmissor 24/7. Fechar ou suspender o navegador interrompe o áudio local e o scheduler da versão atual.

## Escopo por fases

### Fase A — Console web confiável (0.2.x–0.5.x)

- [x] Navegação por módulos: console, biblioteca, programação, comerciais, logs, diagnóstico e configurações.
- [x] Armazenamento de mídia local via IndexedDB.
- [x] Fila e configuração persistidas localmente.
- [x] Classificação editável de mídia.
- [x] Agenda local por dia/horário que injeta mídia na fila enquanto a página está aberta e a automação local está ativa.
- [x] Cadastro de campanha local com mídia comercial, janela de datas, dia e horário.
- [x] Registro local de inícios, conclusões, interrupções e erros; exportação JSON/CSV.
- [x] CI e testes HTTP de fumaça.
- [x] Montador local de bloco musical sem duplicatas no bloco, com exclusão da faixa atual e da fila existente (0.5.0).
- [x] Cartwall com elemento de áudio separado, atenuação do player principal e logs locais de disparo (0.5.0).
- [x] Conteúdo ao vivo com feeds RSS fixos e permitidos, cache curto e pauta local do locutor (0.5.0).
- [x] Conector inicial OBS WebSocket v5 para listar/alterar cenas com confirmação e solicitar prévia, sujeito a validação com OBS real e restrições do navegador.
- [ ] Testes de navegador reais (Chromium/Firefox), testes com arquivos de áudio reais e validação responsiva.
- [ ] Recuperação de falha e política formal de retenção/backup para biblioteca local.
- [ ] Melhorias de acessibilidade e revisão de segurança independente.

### Fase B — Backend SaaS seguro

- Autenticação com sessões/tokens rotacionáveis e recuperação de conta.
- CRUD de organizações, usuários, estações e permissões (RBAC).
- Isolamento obrigatório por organization_id, inclusive em consultas, jobs e arquivos.
- PostgreSQL via migrações versionadas; validação e integração contínua.
- Upload assinado para object storage, verificação de tipo, tamanho, checksum e metadados.
- Auditoria com retenção, paginação e exportação.
- Rate limits, CORS restrito, CSRF onde aplicável, headers, monitoramento e backups testados.
- Testes de acesso cruzado entre organizações como gates de CI.

**Gate de aceite:** nenhum endpoint de dado/áudio de cliente sem autenticação e autorização explícitas; suite de isolamento multi-tenant aprovada.

### Fase C — Qolan Engine para Windows

- Serviço/worker independente da interface, iniciado com Windows, com watchdog e logs rotacionados.
- Banco local SQLite e fila durável; atualização/migração com rollback.
- Engine de reprodução testada com MP3/WAV/OGG/FLAC/AAC, dispositivos de áudio reais e saídas configuráveis.
- Estados formais do player (idle/loading/playing/paused/stopping/failed/recovering).
- Scheduler com zona de tempo explícita, eventos idempotentes, relógios horários, tolerância de atraso e regras de prioridade.
- Transição/fade/crossfade definidos por mídia; pré-escuta por caminho de áudio independente quando o hardware permitir.
- Fallback local configurável, detecção de silêncio na saída, arquivo inválido, dispositivo perdido, crash e recovery.
- Prova de execução produzida pelo engine e sincronizada com a nuvem de forma idempotente.

**Gate de aceite:** teste de soak de 72h com playlist e eventos programados; reinício de processo/dispositivo; zero perda de fila; falhas e gaps medidos e reportados.

### Fase D — Automação e operação comercial

- Clock hours com slots relativos, eventos fixos e tratamento de atraso.
- Regras de rotação (não repetir, artistas, gênero, janela de tempo, prioridades e exclusões).
- Mapa comercial, campanhas com início/fim, quantidade e frequência contratada, substituições e relatório de veiculação.
- Locuções, hora certa e temperatura com fonte de tempo/dados identificada.
- Agora/no ar, próxima mídia, trilha de auditoria e exportação de prova de execução.
- APIs de integração de metadata/Now Playing, RDS e streaming após implementação/testes dos conectores.

**Gate de aceite:** teste determinístico de programação comparando plano versus execução, e contabilização de cada spot contratualmente programado.

### Fase E — Rede, Rádio Visual e assistente inteligente

- Controle de matriz/afiliadas com protocolo autenticado, clocks sincronizados e telemetria.
- Integração opcional com OBS/vMix usando uma bridge local; não executar comandos arbitrários vindos da nuvem.
- Painel remoto de status/controle com confirmação e trilha de auditoria.
- Assistente de IA para rascunhar grades, detectar conflitos, sugerir substituições e explicar riscos, sempre exigindo confirmação humana para alterar conteúdo ou programação no ar.
- Análise de anomalias de silêncio, repetição, falha de mídia, desconexão e divergência da grade.

**Gate de aceite:** controles de acesso, replay protection, autenticação de dispositivos e simulação de queda de conexão em matriz/afiliadas.

## Diferenciais que devem tornar o Qolan melhor

1. **Híbrido por padrão:** operador remoto e gestão cloud, mas playback crítico no edge local.
2. **Observabilidade verificável:** cada indicador deve vir de telemetria real, com origem, horário e evidência.
3. **Falhas explícitas:** mostrar gaps, atrasos, mídia inválida e comandos que não executaram; nunca inventar uptime nem declarar fallback quando ele não está pronto.
4. **Programação explicável:** explicar por que uma faixa ou comercial foi escolhido e qual regra o disparou.
5. **Prova de veiculação útil ao comercial:** relatório comparando planejado, executado, duração e exceções.
6. **Open integrations:** APIs documentadas e bridges isoladas para metadata, encoder e vídeo, respeitando autenticação.
7. **Instalação e atualização segura:** assinaturas, migrações, rollback e atualização automática testada.
8. **Produto adaptável:** configuração por estação, layouts operacionais, acessibilidade e atalhos configuráveis.

## Auditoria técnica e versão 0.5.1

A versão 0.5.1 endurece o leitor RSS com redirecionamentos manuais validados antes de cada salto, limite de bytes aplicado durante a leitura, deduplicação de pedidos simultâneos e cache temporário de último recurso quando a fonte falha. A API retorna JSON 404 para endpoints desconhecidos. O núcleo compartilhado testa fuso horário da emissora, ordem determinística de eventos simultâneos, idempotência por minuto e normalização defensiva de backups. O relógio, as datas e a agenda agora usam o fuso da emissora. A exclusão de mídia interrompe reproduções que dependam do arquivo removido.

A versão continua sendo um console local-first: testes unitários e smoke test não substituem validação em navegador com arquivos, interfaces de áudio e OBS reais.

## Estado da versão 0.5.0

A área Conteúdo ao vivo consome feeds RSS permitidos da Agência Brasil e oferece pauta persistida apenas no navegador. O leitor usa allowlist de domínio, redirecionamentos manuais restritos ao domínio oficial, limite de payload e cache stale-if-error. A cartwall usa um elemento de áudio separado e reduz temporariamente o volume do player principal, mas ainda não é um mixer com saídas profissionais. O montador musical evita repetições dentro do bloco e faixas já presentes na fila. O conector OBS usa WebSocket v5 e precisa ser testado com a instalação local do OBS; em alguns navegadores/contextos será necessária a bridge do Qolan Engine.

## Pendências críticas de engenharia

- O scheduler ainda roda na aba do navegador e não é um motor de playout resiliente; não deve comandar uma emissora sem Qolan Engine.
- O áudio principal e o cartwall usam elementos HTML distintos, porém não têm garantia de saídas físicas independentes, crossfade profissional ou mix-minus.
- O histórico atual é editável/apagável no navegador e não constitui prova jurídica de veiculação.
- As rotas do backend raiz `/organizations` agora são protegidas por um segredo administrativo temporário (`API_ADMIN_TOKEN`), mas ainda não têm autenticação individual, RBAC ou isolamento de tenant comprovado. Não liberar uso SaaS externo antes de implementar login e testes de isolamento.
- O PostgreSQL não deve aceitar certificados TLS inválidos. Conexões externas exigem configuração explícita `DATABASE_SSL=true` com cadeia de confiança válida.

## Estado em produção

A versão web atual é um MVP local-first servido pelo Render. IndexedDB armazena os arquivos no navegador daquele usuário. Não há ainda login, sync multiusuário, storage cloud, engine Windows 24/7, streaming, RBAC ou prova de veiculação legal. O plano Render Free pode suspender o serviço por inatividade; ele hospeda o console, não o motor crítico de áudio.

## Definition of Done para cada versão

- Build, node --check, testes de API e UI automatizados passam.
- Teste manual em Chromium desktop e mobile, incluindo áudio real e quota/erro do IndexedDB.
- Nenhum indicador fictício ou promessa de uptime sem telemetria.
- Migrações e backups testados antes de alterar dados persistentes.
- CI passa no commit exato que será implantado; health check e versão/commit confirmados no Render.
- Notas da versão declaram o que entrou, o que não entrou e limitações conhecidas.


## Qolan Studio Web 0.6.0 — cartwall de operação

A cartwall foi reformulada como cartucheira fixa de 12 slots, com estado de slot, categoria, duração, substituição e remoção sem apagar o arquivo da biblioteca. A importação direta por categoria (vinhetas, comerciais, trilhas) preenche os slots vazios e também registra o arquivo na biblioteca local. F1–F9 disparam os nove primeiros slots fixos. Os slots atribuídos e as regras da rotação são persistidos no IndexedDB e incluídos no backup JSON, filtrando referências a mídia ausente na restauração.

A rotação de vinhetas pode ser ativada para inserir uma vinheta após um intervalo configurável de músicas concluídas (2–12). A inserção é feita na fila; eventos já priorizados de agenda/campanha mantêm precedência. O recurso depende da automação local ativa para tocar sem intervenção e não substitui o motor Windows residente. A interface do console também foi limpa de cartões estáticos que simulavam status de módulos; agora leva aos módulos reais de redação e OBS.
