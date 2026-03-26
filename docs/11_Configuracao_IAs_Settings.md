# Configuracao de IAs e Settings

Principio central: `.env` e para infraestrutura. Configuracoes operacionais do workspace ficam no banco.

Observacao pratica sobre ambiente:

- `backend/.env` e o arquivo usado quando voce sobe o backend localmente com `npm run dev` ou `npm start`
- o `.env` da raiz e o caminho usado pelo `docker-compose.yml`

## O que fica no `.env`

Exemplos:

```env
DATABASE_URL=...
JWT_SECRET=...
VAULT_MASTER_KEY=...
PORT=3001
OPENROUTER_API_KEY=... # apenas fallback de infraestrutura
```

### SQLite local

Quando o backend roda localmente com SQLite, a combinacao recomendada e:

```env
PRISMA_SCHEMA_PATH="prisma/schema.sqlite.prisma"
DATABASE_URL="file:../data/lumiplus.db"
```

Importante:

- esse caminho e relativo a `backend/prisma/schema.sqlite.prisma`
- o arquivo final fica em `backend/data/lumiplus.db`
- os scripts `npm run prisma:generate` e `npm run prisma:push` do backend passam a respeitar `PRISMA_SCHEMA_PATH`

## O que fica em `workspace_settings`

Exemplos de chaves:

```text
openrouter_key
openai_key
anthropic_key
gemini_key
groq_key
moonshot_key
nvidia_nim_key
default_model
economy_mode
custom_ai_providers
evolution_api_url
evolution_global_key
evolution_api_key
evolution_instance
evogo_api_url
evogo_global_key
evogo_api_key
evogo_instance
meta_access_token
meta_ad_account_id
```

Observacao importante:

- a chave oficial do workspace para OpenRouter e `openrouter_key`
- `OPENROUTER_API_KEY` continua como fallback no ambiente

## Fluxo de resolucao

O `SettingsService` consulta:

1. banco do workspace
2. fallback de ambiente quando aplicavel

## Multi-provider

O backend suporta:

- OpenRouter
- OpenAI-compatible
- Anthropic
- Gemini
- DeepSeek
- Moonshot
- NVIDIA NIM

## Resiliencia atual do AIService

- fallback sequencial entre providers/modelos
- filtro de providers mais compativeis para round-trip com tools
- `max_tokens` adaptativo
- retry quando o provider devolve teto menor por falta de credito

## APIs customizadas de produto

APIs nao-IA tambem podem ser salvas no workspace.

Quando o onboarding via chat detecta uma API externa:

- a credencial vai para `workspace_settings`
- a documentacao vai para o Knowledge Hub
- a integracao recebe `type: "custom_api"`
- o `SkillRegistry` expoe `custom_api_<slug>` e aceita placeholders em `call_api`

## Skills nativas com credenciais operacionais

Algumas skills do marketplace dependem de credenciais salvas em `workspace_settings` e ficam disponiveis globalmente para o tenant.

### Evolution API v2.3

- `evolution_api_url`: base URL do servidor
- `evolution_global_key`: chave administrativa
- `evolution_api_key`: chave/token da instancia
- `evolution_instance`: nome padrao da instancia

Capacidades operacionais relevantes:

- envio para numero individual
- envio explicito para grupos via `group_jid`
- criacao e listagem de grupos
- leitura de participantes e codigos de convite
- atualizacao de participantes, assunto, descricao e configuracoes do grupo

### evoGo v3

- `evogo_api_url`: base URL do servidor
- `evogo_global_key`: chave administrativa
- `evogo_api_key`: chave/token da instancia
- `evogo_instance`: nome padrao da instancia

### Meta Ads

- `meta_access_token`: token da Meta Graph / Marketing API
- `meta_ad_account_id`: ID da conta de anuncios; pode ser salvo sem `act_`

Capacidades operacionais relevantes:

- leitura de conta, campanhas, adsets, ads e insights com `meta_ads_read`
- criacao e atualizacao controlada de campanhas e adsets com `meta_ads_manage`
- geracao de meta tags e bloco HTML SEO com `meta_tags_optimizer`

## Como configurar no dashboard

Existem dois caminhos equivalentes para essas integracoes:

- pagina `/settings`, centralizando todas as chaves do workspace
- modal de ativacao da skill em `/skills`

Fluxo atual do modal de ativacao:

1. salva as credenciais preenchidas em `workspace_settings`
2. preserva segredos ja existentes quando o campo fica em branco
3. ativa ou desativa a skill para os agentes selecionados

No caso das skills da Meta:

- `meta_access_token` pode ser salvo como segredo pelo painel de settings
- `meta_ad_account_id` fica salvo no workspace para reaproveitamento automatico
- `meta_ads_manage` continua exigindo confirmacao explicita no momento da execucao, mesmo com a credencial ja salva

## Observacoes

- `*_global_key` deve ser tratada como segredo de alto privilegio
- `*_api_key` e usada nas operacoes de mensageria e canais
- as chaves secretas ficam criptografadas no vault do workspace
- a pagina `/settings` do dashboard expoe os campos de configuracao dessas integracoes, incluindo Evolution, evoGo e Meta Ads
- a pagina `/skills` tambem permite preencher essas credenciais no proprio modal de ativacao da skill
- se uma chave ja estiver salva no workspace, o modal informa que ela ja existe e so precisa ser preenchido de novo para sobrescrever
- no caso da Evolution API v2, a analise de mensagens de grupo depende de webhook/eventos chegando ao Lumi Plus; a skill de grupos sozinha nao busca historico retroativo
- no caso de Meta Ads, `meta_ads_manage` exige `confirm=true` para qualquer operacao mutavel e ainda nao cobre delete ou criacao completa de anuncios/creatives
