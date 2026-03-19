# Schema do Banco de Dados — Lumi Plus
Versão: 2.5 | PostgreSQL 15+ com Row-Level Security

---

## Princípios do Schema

- **Toda tabela tem `tenant_id`** — sem exceção
- **RLS ativado em todas as tabelas** — o banco bloqueia cross-tenant automaticamente
- **Soft delete** — nada é deletado fisicamente (`deleted_at`)
- **Audit trail** — `created_at`, `updated_at`, `created_by` em todas as tabelas
- **UUIDs** como PKs — evita enumeração e facilita merge de dados

---

## Extensões Necessárias

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector"; -- pgvector para embeddings
```

---

## Tabelas

### tenants
Workspaces isolados. Cada usuário/empresa é um tenant.

```sql
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  plan_tier     VARCHAR(50) NOT NULL DEFAULT 'free', -- free | starter | pro | agency
  plan_expires_at TIMESTAMPTZ,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
```

---

### users
Usuários da plataforma. Um usuário pode pertencer a múltiplos tenants.

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255),
  avatar_url    TEXT,
  password_hash TEXT, -- null se usa OAuth
  email_verified_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
```

---

### tenant_members
Relacionamento usuário ↔ tenant com papel.

```sql
CREATE TABLE tenant_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  role       VARCHAR(50) NOT NULL DEFAULT 'member', -- owner | admin | member | viewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_members
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### api_tokens
Tokens de acesso para CLI e API. Armazenados como hash.

```sql
CREATE TABLE api_tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  name         VARCHAR(255) NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE, -- SHA-256 do token real
  token_prefix VARCHAR(20) NOT NULL, -- ex: "sk-lumi-abc1" para exibição
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON api_tokens
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### agents
O coração do sistema. Cada agente tem soul e configuração completa.

```sql
CREATE TABLE agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) NOT NULL,
  description     TEXT,

  -- Soul / Identidade
  mission         TEXT, -- "Você é um especialista em marketing..."
  tone            VARCHAR(100), -- "profissional", "informal", "técnico"
  personality     TEXT, -- descrição livre da personalidade
  rules           TEXT[], -- lista de regras de comportamento
  system_prompt   TEXT NOT NULL, -- gerado ou editado manualmente

  -- IA
  primary_model   VARCHAR(200) DEFAULT 'openai/gpt-4o',
  fallback_models VARCHAR(200)[] DEFAULT ARRAY[
    'anthropic/claude-sonnet-4',
    'google/gemini-flash-1.5',
    'anthropic/claude-haiku-3'
  ],
  economy_mode    BOOLEAN DEFAULT false,
  max_tokens      INT DEFAULT 1000,
  temperature     FLOAT DEFAULT 0.7,

  -- Comportamento
  schedule_enabled BOOLEAN DEFAULT false,
  schedule_config  JSONB DEFAULT '{}', -- dias/horários
  allow_list       TEXT[], -- números/IDs permitidos (null = todos)
  block_list       TEXT[],

  -- Status
  status          VARCHAR(50) DEFAULT 'active', -- active | paused | error
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  UNIQUE(tenant_id, slug)
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agents
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### squads
Times de agentes com configuração visual.

```sql
CREATE TABLE squads (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  mode         VARCHAR(50) DEFAULT 'pipeline', -- pipeline | network
  canvas_state JSONB DEFAULT '{}', -- Estado do React Flow + Chat2Workflow
  status       VARCHAR(50) DEFAULT 'active',
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON squads
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### squad_agents
Agentes dentro de uma squad com ordem e papel.

```sql
CREATE TABLE squad_agents (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  squad_id   UUID NOT NULL REFERENCES squads(id),
  agent_id   UUID NOT NULL REFERENCES agents(id),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  role       VARCHAR(255), -- "Pesquisador", "Redator", "Revisor"
  position   INT DEFAULT 0, -- ordem no pipeline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(squad_id, agent_id)
);

ALTER TABLE squad_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON squad_agents
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

---

### squad_members
(Suporta a nova estrutura de Squads no Prisma)

```sql
CREATE TABLE squad_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  squad_id   UUID NOT NULL REFERENCES squads(id),
  agent_id   UUID NOT NULL REFERENCES agents(id),
  role       VARCHAR(50) DEFAULT 'member', -- leader | worker
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(squad_id, agent_id)
);

ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON squad_members
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```
```

---

### channels
Canais de comunicação vinculados a um agente.

```sql
CREATE TABLE channels (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  agent_id     UUID NOT NULL REFERENCES agents(id),
  type         VARCHAR(50) NOT NULL, -- whatsapp | telegram | api | webchat | webhook
  identifier   VARCHAR(255), -- número do WA, username do TG, etc.
  config       JSONB DEFAULT '{}', -- configurações específicas do canal
  status       VARCHAR(50) DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON channels
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### contacts
Perfis dos contatos externos que falam com os agentes.

```sql
CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  agent_id     UUID NOT NULL REFERENCES agents(id),
  channel_type VARCHAR(50) NOT NULL,
  channel_id   VARCHAR(255) NOT NULL, -- número, user_id, etc.
  name         VARCHAR(255),
  metadata     JSONB DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, agent_id, channel_type, channel_id)
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contacts
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### conversations
Histórico de conversas por contato.

```sql
CREATE TABLE conversations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  agent_id     UUID NOT NULL REFERENCES agents(id),
  contact_id   UUID NOT NULL REFERENCES contacts(id),
  channel_type VARCHAR(50) NOT NULL,
  status       VARCHAR(50) DEFAULT 'active', -- active | human_takeover | closed
  taken_over_by UUID REFERENCES users(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### messages
Mensagens individuais de cada conversa.

```sql
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  role            VARCHAR(20) NOT NULL, -- user | assistant | system
  content         TEXT NOT NULL,
  model_used      VARCHAR(200),
  tokens_used     INT,
  cost_usd        DECIMAL(10, 6),
  latency_ms      INT,
  fallback_level  INT DEFAULT 0, -- qual fallback foi usado (0 = primário)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

---

### agent_memories
Memória de longo prazo dos agentes sobre cada contato.

```sql
CREATE TABLE agent_memories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent_id    UUID NOT NULL REFERENCES agents(id),
  contact_id  UUID NOT NULL REFERENCES contacts(id),
  key         VARCHAR(255) NOT NULL, -- "nome_preferido", "produto_interesse", etc.
  value       TEXT NOT NULL,
  confidence  FLOAT DEFAULT 1.0, -- 0-1, confiança na informação
  source      VARCHAR(100), -- "conversa", "upload", "manual"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, agent_id, contact_id, key)
);

ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_memories
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### agent_knowledge
Base de conhecimento semântica do agente (RAG).

```sql
CREATE TABLE agent_knowledge (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent_id    UUID NOT NULL REFERENCES agents(id),
  title       VARCHAR(255),
  content     TEXT NOT NULL,
  embedding   vector(1536), -- dimensão para text-embedding-3-small
  source_type VARCHAR(50), -- "pdf", "text", "url", "manual"
  source_name VARCHAR(255),
  chunk_index INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_knowledge
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_knowledge_embedding ON agent_knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

### agent_api_keys
Chaves de APIs externas usadas pelos agentes. Sempre criptografadas.

```sql
CREATE TABLE agent_api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  agent_id        UUID REFERENCES agents(id), -- null = chave do workspace
  provider        VARCHAR(100) NOT NULL, -- "openrouter", "openai", "anthropic", etc.
  key_encrypted   TEXT NOT NULL, -- AES-256-GCM, nunca texto plano
  key_iv          TEXT NOT NULL, -- IV da criptografia
  label           VARCHAR(255),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_api_keys
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### agent_skills
Skills instaladas em cada agente.

```sql
CREATE TABLE agent_skills (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  agent_id   UUID NOT NULL REFERENCES agents(id),
  skill_id   VARCHAR(100) NOT NULL, -- "web_search", "api_call", "image_gen"
  config     JSONB DEFAULT '{}',
  enabled    BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_skills
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### audit_events
Log imutável de ações sensíveis. Append-only, nunca atualizado.

```sql
CREATE TABLE audit_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  actor_id    UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL, -- "agent.create", "key.delete", "squad.deploy"
  resource    VARCHAR(100), -- "agent", "squad", "api_key"
  resource_id UUID,
  metadata    JSONB DEFAULT '{}',
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- SEM updated_at, SEM deleted_at — append-only
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_audit_tenant_date ON audit_events(tenant_id, created_at DESC);
```

---

### escalations
Registros de quando um agente pediu ajuda humana.

```sql
CREATE TABLE escalations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  agent_id        UUID NOT NULL REFERENCES agents(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  reason          TEXT,
  status          VARCHAR(50) DEFAULT 'pending', -- pending | resolved | ignored
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON escalations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

---

### human_approvals
Pausas no workflow para decisão ou validação humana (Human-in-the-loop).

```sql
CREATE TABLE human_approvals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  run_id        UUID NOT NULL REFERENCES workflow_runs(id),
  step_id       UUID, -- referência opcional ao step que gerou o pedido
  requested_by  UUID REFERENCES users(id), -- se um agente físico pediu
  context       JSONB NOT NULL DEFAULT '{}', -- dados para o humano validar
  status        VARCHAR(50) DEFAULT 'pending', -- pending | approved | rejected
  comments      TEXT, -- justificativa do humano
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE human_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON human_approvals
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```
```

---

### workflows
Definição visual e lógica de automações.

```sql
CREATE TABLE workflows (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  trigger     JSONB NOT NULL, -- { type: "webhook" | "schedule" | "event", config: {} }
  definition  JSONB NOT NULL, -- Nós e conexões do canvas
  status      VARCHAR(50) DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflows
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### workflow_runs
Instâncias de execução de um workflow.

```sql
CREATE TABLE workflow_runs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  workflow_id UUID NOT NULL REFERENCES workflows(id),
  status      VARCHAR(50) DEFAULT 'pending', -- pending | running | waiting_approval | completed | failed
  state       JSONB DEFAULT '{}', -- Estado atual da execução
  error       TEXT,
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_runs
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

### workflow_tasks
Tarefas individuais delegadas a agentes dentro de um run.

```sql
CREATE TABLE workflow_tasks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  run_id      UUID NOT NULL REFERENCES workflow_runs(id),
  agent_id    UUID REFERENCES agents(id),
  status      VARCHAR(50) DEFAULT 'pending',
  input       JSONB DEFAULT '{}',
  output      JSONB,
  error       TEXT,
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workflow_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_tasks
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

## Configuração do RLS no Backend

Antes de qualquer query, o backend define o tenant atual:

```sql
-- Executar no início de cada request autenticado
SELECT set_config('app.current_tenant', $1, true);
-- $1 = tenant_id extraído do JWT
```

Em Prisma/Node.js:
```javascript
// Middleware de request
async function setTenantContext(tenantId) {
  await prisma.$executeRaw`
    SELECT set_config('app.current_tenant', ${tenantId}, true)
  `;
}
```

---

## Indexes Importantes

```sql
-- Performance de queries frequentes
CREATE INDEX idx_agents_tenant ON agents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_agent ON conversations(agent_id, last_message_at DESC);
CREATE INDEX idx_messages_created ON messages(conversation_id, created_at);
CREATE INDEX idx_memories_contact ON agent_memories(agent_id, contact_id);
CREATE INDEX idx_contacts_channel ON contacts(tenant_id, channel_type, channel_id);
```

---

## Migrations

Gerenciadas via Prisma Migrate:
```bash
npx prisma migrate dev --name init
npx prisma migrate deploy  # produção
```
