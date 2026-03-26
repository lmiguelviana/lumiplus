# Lumi Plus

Plataforma multi-tenant para criar, operar e evoluir agentes de IA com chat web, canais externos, workflows, squads, knowledge hub e integracoes customizadas.

## Principais capacidades

- Multi-provider de IA com fallback entre OpenRouter, OpenAI-compatible, Anthropic, Gemini, DeepSeek, Moonshot e NVIDIA NIM
- Chat web, WhatsApp, Telegram e API
- Skills por agente com marketplace e ativacao dinamica
- Skills nativas para Evolution API v2.3 e evoGo v3
- Skills nativas para SEO (`meta_tags_optimizer`) e operacao segura de Meta Ads
- Workflows e squads acionados pelo dashboard ou pela conversa
- Knowledge Hub com busca e memoria operacional
- Vault de credenciais por workspace
- Onboarding deterministico de APIs externas via chat

## Instalacao

O instalador agora permite escolher o banco da instancia:

- `Supabase/Postgres`
- `SQLite local`

Fluxo recomendado:

```bash
chmod +x install.sh
./install.sh
```

Com isso, o script ajusta:

- `DATABASE_URL`
- `PRISMA_SCHEMA_PATH`
- o profile do Docker quando for usar Postgres local

Observacao: essa escolha e por instalacao inteira, nao por usuario dentro do app.

## Desenvolvimento local

Para rodar o backend localmente fora do Docker, considere dois pontos:

- o backend em terminal usa `backend/.env`
- o modo Docker Compose usa o `.env` da raiz

### SQLite local no backend

Para desenvolvimento leve em Windows ou sem Postgres disponivel, o backend suporta SQLite com:

```env
PRISMA_SCHEMA_PATH="prisma/schema.sqlite.prisma"
DATABASE_URL="file:../data/lumiplus.db"
```

Observacao importante:

- o caminho SQLite e relativo ao schema Prisma em `backend/prisma/`, por isso o valor correto e `file:../data/lumiplus.db`
- `file:./data/lumiplus.db` faz o Prisma tentar abrir o arquivo em um caminho diferente do esperado

Fluxo recomendado no terminal:

```bash
cd backend
npm run prisma:generate
npm run prisma:push
npm run db:seed
npm run dev
```

Os scripts Prisma do backend agora respeitam `PRISMA_SCHEMA_PATH`, entao o mesmo fluxo funciona tanto para `schema.prisma` quanto para `schema.sqlite.prisma`.

### Troubleshooting rapido do dashboard

Se o dashboard mostrar telas vazias, listas sem agentes/workflows ou erros `500` em rotas como:

- `/api/v1/dashboard/agents`
- `/api/v1/squads`
- `/api/v1/ai/chat`

nao assuma primeiro que os dados sumiram. No fluxo local, isso normalmente significa que o backend em `localhost:3001` nao esta respondendo.

Sinais comuns:

- a UI abre, mas `Agentes`, `Workflows` ou `Chat` falham ao carregar
- o Next mostra `AxiosError: Request failed with status code 500`
- o navegador bate em `/api/v1/...`, mas o proxy do Next nao encontra um backend funcional por tras

Checklist rapido:

```bash
curl http://localhost:3001/health
```

Se responder `status: ok`, o backend local esta vivo.

Se nao responder:

```bash
cd backend
npm run build
node dist/server.js
```

Observacoes importantes:

- o painel Next em `localhost:3000` depende do backend em `localhost:3001`
- quando o backend cai, a interface pode parecer "vazia" mesmo com os dados ainda presentes no banco correto
- antes de trocar `DATABASE_URL`, confirme se o problema e realmente banco ou apenas indisponibilidade do processo backend

## Onboarding de APIs customizadas

Quando o usuario envia uma mensagem longa com documentacao, endpoint e token de uma API externa, o backend tenta registrar a integracao antes de depender do modelo:

1. salva a credencial no vault do workspace
2. salva a documentacao no Knowledge Hub
3. registra a integracao `custom:<slug>` no agente
4. expoe uma tool dinamica `custom_api_<slug>`

Depois disso, o agente pode reutilizar a API em mensagens futuras sem precisar "reinstalar" a integracao.

## Integracoes WhatsApp nativas

O marketplace agora inclui duas skills nativas para operacao via APIs externas de WhatsApp:

- `evolution_api_v2`: wrapper nativo para Evolution API v2.3
- `evogo_api`: wrapper nativo para Evolution API Go v3

Essas skills permitem ao agente criar instancias, conectar QR/pairing, enviar mensagens, validar numeros e executar operacoes de grupo sem depender de uma integracao customizada generica.

No caso da `evolution_api_v2`, o suporte atual a grupos cobre:

- envio explicito para grupo com `send_group_text` e `send_group_media`
- listagem de grupos e consulta de informacoes do grupo
- leitura de participantes
- convite e codigo de convite
- atualizacao de participantes, assunto, descricao e configuracoes do grupo
- saida do grupo

Observacao importante:

- analisar o conteudo das conversas de grupo depende de eventos/webhook da Evolution chegando ao Lumi Plus; nao e uma leitura retroativa de historico via skill isolada

As credenciais podem ser configuradas de duas formas no dashboard:

- pela pagina `Settings & BYOK`
- pelo modal de ativacao da propria skill em `/skills`

Nos dois casos, os valores sao salvos em `workspace_settings` e segredos continuam indo para o vault do workspace.

Chaves usadas por essas integracoes:

- `evolution_api_url`
- `evolution_global_key`
- `evolution_api_key`
- `evolution_instance`
- `evogo_api_url`
- `evogo_global_key`
- `evogo_api_key`
- `evogo_instance`

Recomendacao operacional:

- use apenas hosts confiaveis ou self-hosted para essas APIs
- mantenha as global keys apenas no vault do workspace
- prefira a instance key para operacoes de mensageria sempre que possivel
- se a skill ja estiver configurada no workspace, o modal de ativacao reaproveita a configuracao existente e so precisa ser preenchido de novo quando voce quiser substituir a credencial

## Integracoes nativas de SEO e Meta Ads

O marketplace agora tambem inclui skills nativas para marketing e performance:

- `meta_tags_optimizer`: gera `title`, `meta description`, `og:*` e `twitter:*` com base em briefing manual ou URL
- `meta_ads_read`: consulta conta, campanhas, adsets, ads e insights na Meta Marketing API
- `meta_ads_manage`: altera campanhas e adsets de forma controlada, sempre exigindo confirmacao explicita

Configuracao dessas integracoes no workspace:

- `meta_access_token`
- `meta_ad_account_id`

Esses dados podem ser preenchidos em `Settings & BYOK`, junto das demais credenciais operacionais.

Diretriz operacional:

- use `meta_tags_optimizer` para diagnostico SEO e geracao de tags prontas para HTML
- use `meta_ads_read` para leitura, auditoria e acompanhamento de performance
- use `meta_ads_manage` apenas quando o usuario confirmar claramente a alteracao

Limites atuais de seguranca:

- `meta_ads_manage` cobre criacao e atualizacao de campanhas e conjuntos
- a skill ainda nao executa delete, criacao de criativo nem criacao do anuncio final
- o handler exige `confirm=true` para evitar alteracoes acidentais em contas com gasto real

## Aprovacao humana na propria conversa

Os passos de `human_approval` em workflows e squads agora priorizam a propria conversa que iniciou a execucao.

- o usuario recebe o pedido de aprovacao no mesmo chat web, Telegram ou WhatsApp de origem
- `sim` aprova e o workflow segue
- `nao: ajuste ...` devolve feedback e faz a IA refazer a etapa anterior
- nao e mais necessario preencher manualmente um `@usuario` para Telegram/WhatsApp
- se a execucao nascer sem conversa ativa, a aprovacao continua pendente no painel

## Estrutura

```text
lumiplus/
  backend/     API Fastify + Prisma + Skills + Providers
  dashboard/   App Next.js
  cli/         Ferramenta de setup e operacao
  docs/        Documentacao funcional e historico por fase
```

## Documentacao

- [Arquitetura](./ARCHITECTURE.md)
- [Guia de Integracoes](./docs/07_Guia_Integracoes.md)
- [Configuracao de IAs e Settings](./docs/11_Configuracao_IAs_Settings.md)
- [Fases do projeto](./docs/fase_atual/README.md)

## Fluxo interno

Para tarefas de desenvolvimento, o projeto usa o kit em `.agent/`.

- Consulte o agente especialista em `.agent/agents/` antes de implementar
- Consulte skills em `.agent/skills/` quando a tarefa pedir um fluxo especifico
- Use `.agents/agents` como atalho/ponte de compatibilidade para esse protocolo

## Status atual

Fase 41 em refinamento e atualizacoes aplicadas em 26/03/2026:

- instalador com escolha entre `Supabase/Postgres` e `SQLite local`
- onboarding de APIs customizadas via chat e tools dinamicas `custom_api_*`
- email nativo, vault de credenciais e templates de agentes
- skills nativas `evolution_api_v2` e `evogo_api` adicionadas ao marketplace
- skills `meta_tags_optimizer`, `meta_ads_read` e `meta_ads_manage` adicionadas ao marketplace
- modal de ativacao das skills agora persiste credenciais no workspace antes de ativar o agente
- `evolution_api_v2` expandida com operacoes nativas de grupos, incluindo envio para `@g.us`, listagem, participantes e configuracoes
- `/settings` agora expoe `meta_access_token` e `meta_ad_account_id` para configuracao centralizada das skills da Meta
- modo local do backend documentado com `backend/.env`, SQLite em `backend/data/lumiplus.db` e fluxo Prisma alinhado ao schema escolhido
- workflows agora aparecem por agente selecionado no dashboard
- squads abertas pelo agente passam a assumir esse agente como lider padrao
- funcionarios da squad agora aceitam `mandato especifico` em texto e arquivos `.md/.txt`
- mandatos salvos no canvas entram na execucao de workflows e squads
- aprovacao humana agora retorna para a mesma conversa do usuario e suporta revisao com feedback natural
- frontend e backend validados com `npm run build`
