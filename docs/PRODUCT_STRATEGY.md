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


## Atualização visual 0.6.1 — cartwall colorido

A cartucheira recebe 12 identidades de cor persistentes por posição, com fundos escuros tonalizados, acentos de alto contraste, foco visual nos ícones e estado de reprodução destacado. A codificação das posições não substitui a etiqueta de categoria (vinheta, comercial ou trilha), e slots vazios continuam identificáveis e fáceis de localizar. Alteração visual sem mudança na lógica de disparo ou na persistência dos cartuchos.


## Qolan Studio 0.7.0 — console, pré-escuta e áudio técnico

- O console principal deixa de apresentar cartões auxiliares e avisos longos; os módulos de conteúdo e operação secundária continuam disponíveis pelas páginas próprias.
- A cartwall usa a altura natural do conteúdo, com 4 colunas no desktop e layout responsivo em telas menores; não limita a área a uma altura fixa que encubra posições.
- Relógio digital com horário ajustado por amostra do endpoint de saúde do servidor e convertido para o fuso da emissora configurado. Se a sincronização falhar, identifica que está usando o relógio do dispositivo.
- Player PFL/pré-escuta separado do player principal, com seleção de mídia, play/pausa, parada, progresso e tempo. A pré-escuta não altera a fila nem a sessão de execução no ar.
- Página Áudio técnico com faders de volume de programa, cartwall e pré-escuta, detecção de saídas e seleção de dispositivos conforme as APIs oferecidas pelo navegador.
- Limite mantido explicitamente: seleção de saída e canais independentes dependem do navegador, permissões e drivers do computador. Isto não é mixer de hardware, driver ASIO/WASAPI dedicado nem engine Windows 24/7. Esse trabalho continua como evolução separada da Qolan Engine.
- Preferências de volume entram no backup; IDs de saídas físicas são descartados na restauração porque podem pertencer a outro computador. As seleções locais permanecem no armazenamento do navegador.


## Qolan Studio 0.8.1 — operação dos cartuchos e roteiro de emissão

- Cartuchos de disparo usam comportamento toggle: o segundo clique no cartucho que está tocando para o disparo atual; clicar em outro cartucho substitui a reprodução no cartwall sem trocar a faixa principal.
- Filtros de vinheta/comercial/trilha ocultam itens de outras categorias em vez de representar o mesmo cartucho como um falso cartão da categoria selecionada.
- Slots normalizados não aceitam referências repetidas para o mesmo arquivo; importação em lote ignora mídias já atribuídas e evita duplicação de referência.
- Pré-escuta tem atalho permanente na barra superior e ação visível no cabeçalho do programa principal, além da página dedicada e da ação na biblioteca.
- Cabeçalho mais compacto; relógio digital com bezel premium, algarismos monoespaçados e indicação de origem/fuso.
- Fila de áudio revisada como rundown de radiodifusão: posição, previsão de execução, tipo de evento, título e duração. Destaque visual para o item seguinte.


## Qolan Studio 0.9.0 — Aero Glass Console

A mudança de linguagem visual inspira-se nos princípios divulgados para cockpits digitais modernos de jatos executivos, incluindo o Falcon 10X: telas grandes, organização intuitiva, menor ruído visual e comandos táteis claramente hierarquizados. A implementação é uma identidade visual original do Qolan, sem reproduzir logotipos, instrumentos aeronáuticos ou telas proprietárias.

- Paleta azul-grafite com vidro escuro, contornos metálicos e ciano luminoso para controles primários; verde menta reservado aos estados operacionais e âmbar/vermelho para avisos.
- Sidebar revisada como painel de sistemas, com navegação agrupada, seleção luminosa e cartões de emissora com contornos suaves.
- Barra superior e barra de comando com hierarquia de instrumentos, relógio digital maior, fonte monoespaçada e acentos ciano.
- Botões remodelados como comandos táteis com profundidade, borda de destaque, feedback de pressionamento, foco acessível e estados diferenciados para play, stop, próxima faixa, automação e pré-escuta.
- Cartuchos tratados como teclas iluminadas de ação direta, preservando sua cor de categoria e realçando o cartucho em disparo.
- Painéis com efeito glass/digital instrument, bordas e gradientes discretos, medidores de áudio e roteiro de veiculação integrados ao mesmo design system.
- Escopo visual: a mudança não simula dados de voo nem altera a lógica de reprodução, fila, cartwall, pré-escuta ou roteamento de áudio.


## Qolan Studio 0.10.0 — cartuchos personalizáveis

- Cada um dos 12 slots possui editor de personalização acessível pelo botão “Personalizar”, inclusive antes de carregar um arquivo.
- O nome exibido pode ser personalizado por posição, sem alterar o nome original do arquivo na Biblioteca.
- A cor interna pode ser escolhida por seletor de cor ou amostras rápidas, com contraste de texto adaptado para cores claras/escuras. A cor da posição e o realce de reprodução continuam separados.
- As preferências são persistidas no estado local e incluídas nos backups JSON. A restauração sanitiza o texto (com escape ao renderizar) e aceita somente cores hexadecimais `#RRGGBB`.
- O botão “Restaurar padrão” remove o nome e a cor personalizada daquela posição; esvaziar/trocar o áudio não apaga as preferências do slot.
