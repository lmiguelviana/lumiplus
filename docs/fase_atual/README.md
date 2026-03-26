# Lumi Plus | Current Progress

Este diretorio guarda o historico detalhado das fases do projeto.

## Navegacao por fases

- [Fase 00: Analise & Planejamento](./00_Analise_Planejamento.md)
- [Fase 01: Fundacao de Dados & Prisma](./01_Fundacao_Dados.md)
- [Fase 02: Core IA & Orquestracao OpenRouter](./02_IA_Orquestracao.md)
- [Fase 03: CLI de Gerenciamento](./03_CLI_Gerenciamento.md)
- [Fase 04: Inteligencia & RAG Progressivo](./04_Inteligencia_RAG.md)
- [Fase 05: Observabilidade & Logs](./05_Observabilidade_Logs.md)
- [Fase 06: Infraestrutura & Deployment VPS](./06_Infraestrutura_VPS.md)
- [Fase 07: Decisoes Tecnicas (ADR)](./07_Decisoes_Tecnicas.md)
- [Fase 08: Dashboard Web](./08_Dashboard_Web.md)
- [Fase 09: Multimodalidade](./09_Multimodalidade.md)
- [Fase 10: Portal de Canais Web](./10_Portal_Canais_Web.md)
- [Fase 12: Knowledge Hub](./12_Knowledge_Hub_RAG.md)
- [Fase 13: Analytics Pro](./13_Analytics_Pro.md)
- [Fase 14: Evolucao do Nucleo](./14_Evolucao_Nucleo.md)
- [Fase 15: Workspace Settings & BYOK](./15_Workspace_Settings_BYOK.md)
- [Fase 16: Dashboard Real-Time & Telemetria](./16_Dashboard_RealData_Telemetry.md)
- [Fase 17: Workflow de Squads](./17_Workflows_Squads.md)
- [Fase 18: Hierarquia Agent-Employee & Comando](./18_Hierarquia_Agentes.md)
- [Fase 19: Persistencia BullMQ & Human-in-the-loop](./19_Persistencia_BullMQ.md)
- [Fase 20: Squad Builder](./20_Squad_Builder_Correcao.md)
- [Fase 21: Spawn Agent Dinamico](./21_Spawn_Agent_Dinamico.md)
- [Fase 22: Compatibilidade com Frameworks Open-Source](./22_Compatibilidade_Frameworks_OpenSource.md)
- [Fase 23: Squad Evolutivo](./23_Squad_Evolutivo_AutoAprendizado.md)
- [Fase 24: SaaS Foundation](./24_SaaS_Foundation.md)
- [Fase 25: Refinamento da Arquitetura](./25_Refinamento_Arquitetura.md)
- [Fase 26: Multi-Provider AI](./26_Multi_Provider_AI.md)
- [Fase 27: Inline Buttons](./27_Inline_Buttons.md)
- [Fase 28: Suporte a Grupos](./28_Grupos_Bot.md)
- [Fase 29: Allowlist & Controle de Acesso](./29_Allowlist_Controle_Acesso.md)
- [Fase 30: Marketplace de Skills](./30_Marketplace_Skills.md)
- [Fase 31: Instagram Publisher](./31_Instagram_Publisher.md)
- [Fase 32: Multi-Social Publisher](./32_Multi_Social_Publisher.md)
- [Fase 35: Auto-Configuracao, Workflows & SQLite](./35_Auto_Configuracao_Workflows_SQLite.md)
- [Fase 36: Auth, Onboarding & Deploy](./36_Auth_Onboarding_Deploy.md)
- [Fase 37: NVIDIA NIM & Kimi K2.5](./37_NVIDIA_NIM_Kimi_Integration.md)
- [Fase 38: Autonomia Conversacional](./38_Autonomo_Squad_Workflow_Skills.md)
- [Fase 39: Onboarding de APIs Customizadas](./39_Onboarding_APIs_Customizadas.md)
- [Fase 40: Email Nativo & UI de Credenciais](./40_Email_Nativo_Templates_Agentes.md)
- [Fase 41: Refinamentos Operacionais](./41_Refinamentos_Operacionais_25_03_2026.md)

## Status global

| Fase | Titulo | Status |
|------|--------|--------|
| 35 | Auto-Configuracao, Workflows & SQLite | Concluido |
| 36 | Auth, Onboarding & Deploy | Concluido |
| 37 | NVIDIA NIM & Kimi K2.5 | Concluido |
| 38 | Autonomia Conversacional | Concluido |
| 39 | APIs Customizadas & Estabilidade | Concluido |
| 40 | Email Nativo & UI de Credenciais | Concluido |
| 41 | Refinamentos Operacionais | Em andamento |

## Status atual - 25/03/2026

Fase 40 foi concluida e entrou em refinamento operacional em 25/03/2026, consolidando email nativo, onboarding de APIs customizadas, workflows por agente e squads com contexto persistente por funcionario.

### Destaques

- onboarding deterministico para mensagens com documentacao + endpoint + token
- credenciais e settings alinhados em torno de `openrouter_key`
- integracoes de email (IMAP/SMTP) e credenciais de e-mail 100% integradas ao Vault do sistema
- templates de agentes especialistas em SEO e Marketing adicionados nativamente
- workflows agora sao exibidos por agente selecionado, evitando a sensacao de lista global
- squads criadas a partir de um agente assumem esse agente como lider padrao no canvas
- funcionarios da squad agora aceitam `mandato especifico` em texto e upload de `.md/.txt`
- mandatos anexados no canvas entram na execucao do worker de workflow e na delegacao interna da squad
- etapas de `human_approval` voltam para a mesma conversa que iniciou a execucao
- respostas naturais como `sim` e `nao: ajuste ...` agora controlam aprovacao e retrabalho
- o chat web sincroniza a conversa ativa da squad para exibir pedidos de aprovacao sem refresh manual
- skills nativas `evolution_api_v2` e `evogo_api` passam a existir no marketplace com configuracao via `/settings`
- o modal de ativacao das skills tambem salva credenciais no workspace e reaproveita configuracoes ja existentes
- `evolution_api_v2` passa a cobrir melhor operacoes de grupo, incluindo envio para grupo, participantes e configuracoes
- skills `meta_tags_optimizer`, `meta_ads_read` e `meta_ads_manage` passam a existir no marketplace com configuracao via `/settings`
- `meta_ads_manage` entra com guarda de confirmacao explicita e escopo reduzido para evitar alteracoes sensiveis sem controle
- troubleshooting operacional passa a explicitar que `500` no Next com UI vazia pode ser backend local offline em `localhost:3001`, e nao perda de dados
- backend e dashboard validados com `npm run build`
