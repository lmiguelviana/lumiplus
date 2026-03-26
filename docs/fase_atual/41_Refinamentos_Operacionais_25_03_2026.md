# Fase 41: Refinamentos Operacionais - 25/03/2026

## Objetivo

Consolidar a experiencia de squads e workflows no dashboard, reduzindo ambiguidade visual e garantindo que o contexto configurado no canvas realmente entre na execucao.

## Entregas registradas

### 1. Workflows por agente

- a sidebar de workflows passa a refletir o agente selecionado
- o titulo da area deixa explicito que a lista pertence ao agente atual
- a criacao e a geracao via chat passam a salvar o vinculo com o agente
- o nome do workflow pode ser renomeado pela interface

### 2. Lider padrao na squad

- ao abrir ou criar uma squad a partir de um agente, esse agente passa a ser o lider padrao
- o backend aceita `leaderAgentId` na criacao para manter a regra consistente
- o canvas sincroniza esse lider com os `SquadMember` persistidos

### 3. Mandato especifico com upload

- cada funcionario da squad continua podendo receber texto livre em `mandato especifico`
- agora o bloco tambem aceita upload de arquivos `.md` e `.txt`
- os arquivos ficam persistidos no `canvasState` como parte da configuracao daquele funcionario

### 4. Mandato entrando na execucao real

- no worker de workflow, o mandato do funcionario passa a ser montado a partir do texto e dos arquivos anexados
- na execucao de squad, o lider recebe a descricao dos mandatos fixos do canvas
- quando o lider delega, o worker escolhido recebe junto o mandato persistido no canvas

### 5. Aprovacao humana pela propria conversa

- o node de aprovacao deixa de depender de um `@usuario` manual para Telegram ou WhatsApp
- quando a squad ou workflow nasce a partir de uma conversa, a aprovacao retorna para esse mesmo fio
- o usuario pode responder `sim` para seguir ou `nao: ajuste ...` para pedir revisao
- ao reprovar, o sistema volta para a etapa anterior e reaproveita o feedback humano no novo ciclo
- no chat web, a conversa ativa da squad passa a sincronizar os pedidos de aprovacao de forma automatica

### 6. Skills nativas Evolution API v2 e evoGo

- o catalogo de skills passou a incluir `evolution_api_v2` e `evogo_api`
- o backend ganhou wrappers nativos para operacoes confirmadas nas documentacoes dessas APIs
- as credenciais dessas integracoes entraram no vault do workspace via `settings.routes.ts`
- a pagina `/settings` do dashboard agora expoe os campos de configuracao de URL, global key, instance key e instance padrao
- o modal de ativacao da skill em `/skills` agora tambem persiste essas credenciais no workspace antes da ativacao
- a skill `evolution_api_v2` ganhou suporte nativo ampliado para grupos: envio para `@g.us`, listagem, info, participantes, convites e atualizacoes do grupo
- isso reduz a necessidade de tratar Evolution/evoGo como APIs customizadas genericas quando o usuario quer apenas usar recursos padrao de WhatsApp

### 7. Backend local com SQLite documentado

- o fluxo local do backend ficou explicitado para evitar dependencia acidental de um Postgres remoto indisponivel
- a documentacao agora separa melhor o papel de `backend/.env` no modo terminal local e do `.env` raiz no Docker Compose
- o caminho correto do SQLite ficou registrado como `file:../data/lumiplus.db`, porque o Prisma resolve esse valor a partir de `backend/prisma/`
- os scripts Prisma do backend passaram a respeitar `PRISMA_SCHEMA_PATH`, deixando Postgres e SQLite com o mesmo fluxo operacional no terminal

### 8. Troubleshooting de backend offline no dashboard

- ficou registrado que UI vazia em `Agentes`, `Workflows`, `Squads` ou `Chat` pode ser apenas backend local fora do ar, e nao perda de dados
- o caso observado foi o Next em `localhost:3000` seguir vivo enquanto o backend em `localhost:3001` nao respondia
- isso gerou `500` no proxy do Next para rotas como `/api/v1/dashboard/agents`, `/api/v1/squads` e `/api/v1/ai/chat`
- o procedimento operacional recomendado passou a ser verificar primeiro `GET /health` em `localhost:3001` antes de trocar `DATABASE_URL` ou assumir problema no banco
- a documentacao do README agora inclui esse checklist para evitar diagnostico errado em ambiente local

### 9. Skills nativas de Meta Ads e SEO

- o catalogo passou a incluir `meta_tags_optimizer`, `meta_ads_read` e `meta_ads_manage`
- `meta_tags_optimizer` gera `title`, `meta description`, `og:*` e `twitter:*` com base em briefing ou URL informada
- `meta_ads_read` cobre leitura de conta, campanhas, adsets, ads e insights
- `meta_ads_manage` cobre criacao e atualizacao controlada de campanhas e adsets
- `meta_access_token` entrou no cofre de segredos do workspace
- a pagina `/settings` agora expoe `meta_access_token` e `meta_ad_account_id`
- o fluxo mutavel de Meta Ads ganhou guarda obrigatoria com `confirm=true`
- a primeira versao ficou deliberadamente sem delete, sem criativo e sem criacao do anuncio final para reduzir risco operacional

## Impacto funcional

- workflows deixam de parecer globais quando o usuario troca de agente
- squads novas ja abrem com lider coerente com o contexto atual
- funcionarios da squad passam a ter contexto operacional reutilizavel, e nao apenas texto visual no editor
- aprovacoes humanas passam a funcionar como parte da conversa, em vez de depender de roteamento manual por usuario externo
- agentes agora podem operar Evolution API v2.3 e evoGo v3 como skills de marketplace com configuracao centralizada no workspace
- o fluxo de ativacao das skills deixa de perder credenciais digitadas no modal e passa a reutilizar configuracoes ja salvas
- grupos da Evolution passam a ter operacao nativa mais completa, embora a analise do conteudo das conversas ainda dependa de webhook/eventos entrando no Lumi
- o ambiente local do backend passa a ter um caminho documentado e reproduzivel para subir com SQLite e seed minima
- o time passa a ter um diagnostico mais seguro para diferenciar backend offline de perda real de dados no banco
- o produto passa a cobrir um caso forte de marketing: SEO on-page e leitura/gestao segura de Meta Ads pelo marketplace nativo

## Validacao

- `backend`: `npm run build`
- `backend`: `npm test -- tests/services/skill-registry.test.ts`
- `dashboard`: `npm run build`
