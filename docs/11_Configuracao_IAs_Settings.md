# Configuração de IAs e Settings — Lumi Plus
Versão: 1.0 | Documento novo

---

## Princípio Central

**O .env é só para infraestrutura. Tudo que o usuário configura fica no banco.**

O frontend nunca lê o `.env` do backend. Ele busca as configurações via API autenticada — sempre atualizadas, sempre sincronizadas com o que está rodando.

---

## 1. O que fica onde

### `.env` — apenas segredos de infraestrutura (nunca mudam após deploy)

```env
DATABASE_URL=postgresql://user:pass@host:5432/lumiplus
REDIS_URL=redis://:password@host:6379
JWT_SECRET=<64+ bytes hex>
JWT_REFRESH_SECRET=<64+ bytes hex>
VAULT_MASTER_KEY=<32 bytes hex>
PORT=3001
```

Isso é tudo. Nenhuma chave de API de produto fica aqui.

### Banco de dados — tudo que o usuário pode mudar

Tabela `workspace_settings` — gerenciada pelo dashboard e pelo chat:

```sql
CREATE TABLE workspace_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  key         VARCHAR(100) NOT NULL,
  value       TEXT NOT NULL,        -- sempre criptografado para chaves sensíveis
  is_secret   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workspace_settings
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

Exemplos de keys:
```
openrouter_key        (secret)
openai_key            (secret)
anthropic_key         (secret)
gemini_key            (secret)
groq_key              (secret)
brave_search_key      (secret)
brevo_key             (secret)
meta_app_id           (secret)
meta_app_secret       (secret)
default_model         (public)  → "openai/gpt-4o"
economy_mode          (public)  → "false"
custom_ai_providers   (secret)  → JSON array
```

---

## 2. SettingsService — Fonte Única de Verdade

```typescript
// src/services/SettingsService.ts

export class SettingsService {
  // Lê config: banco primeiro, .env como fallback (compatibilidade)
  async get(tenantId: string, key: string): Promise<string | null> {
    // 1. Tenta banco
    const row = await prisma.workspaceSettings.findUnique({
      where: { tenant_id_key: { tenant_id: tenantId, key } }
    });

    if (row) {
      return row.is_secret
        ? vaultDecrypt(row.value)
        : row.value;
    }

    // 2. Fallback para .env (compatibilidade com instalações antigas)
    const envKey = `LUMI_${key.toUpperCase()}`;
    return process.env[envKey] ?? null;
  }

  async set(tenantId: string, key: string, value: string, isSecret = false) {
    const stored = isSecret ? vaultEncrypt(value) : value;

    await prisma.workspaceSettings.upsert({
      where: { tenant_id_key: { tenant_id: tenantId, key } },
      create: { tenant_id: tenantId, key, value: stored, is_secret: isSecret },
      update: { value: stored, updated_at: new Date() }
    });
  }

  async list(tenantId: string): Promise<Record<string, string>> {
    const rows = await prisma.workspaceSettings.findMany({
      where: { tenant_id: tenantId }
    });

    return Object.fromEntries(
      rows.map(r => [
        r.key,
        r.is_secret ? '••••••••' : r.value  // nunca expõe secrets na listagem
      ])
    );
  }
}
```

---

## 3. API de Settings para o Frontend

```typescript
// src/routes/settings.ts

// GET /v1/settings — frontend busca tudo aqui
app.get('/v1/settings', { preHandler: [authenticate] }, async (req, reply) => {
  const settings = await settingsService.list(req.tenantId);
  return reply.send({ settings });
});

// PUT /v1/settings/:key — salvar uma configuração
app.put('/v1/settings/:key', { preHandler: [authenticate] }, async (req, reply) => {
  const { key } = req.params;
  const { value } = req.body;

  const isSecret = SECRET_KEYS.includes(key);
  await settingsService.set(req.tenantId, key, value, isSecret);

  return reply.send({ ok: true, key });
});

// GET /v1/settings/ai/models — lista modelos disponíveis
app.get('/v1/settings/ai/models', { preHandler: [authenticate] }, async (req, reply) => {
  const models = await aiService.listAvailableModels(req.tenantId);
  return reply.send({ models });
});

const SECRET_KEYS = [
  'openrouter_key', 'openai_key', 'anthropic_key', 'gemini_key',
  'groq_key', 'brave_search_key', 'brevo_key', 'meta_app_secret',
  'custom_ai_providers'
];
```

---

## 4. Suporte a Todas as IAs

### 4.1 OpenRouter — todos os modelos automaticamente

O OpenRouter tem 200+ modelos. Como o Lumi usa o endpoint unificado, qualquer modelo novo funciona automaticamente — sem mudança de código, só o slug muda.

```typescript
// src/services/AIService.ts

async chat(messages: Message[], agent: Agent): Promise<string> {
  const key = await settingsService.get(agent.tenantId, 'openrouter_key');
  const models = agent.economyMode
    ? ECONOMY_MODELS
    : [agent.primaryModel, ...agent.fallbackModels];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lumiplus.com',
      'X-Title': 'Lumi Plus'
    },
    body: JSON.stringify({
      models,              // OpenRouter tenta na ordem, fallback nativo
      route: 'fallback',
      messages,
      max_tokens: agent.maxTokens ?? 1000
    })
  });

  return (await response.json()).choices[0].message.content;
}

// Modelos de economia — usados quando economyMode = true
const ECONOMY_MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-exp',
  'anthropic/claude-haiku-3-5',
  'meta-llama/llama-3.3-70b-instruct'
];
```

### 4.2 Providers Diretos (sem OpenRouter)

Para menor latência ou features exclusivas:

```typescript
// src/services/providers/

// OpenAI direto
class OpenAIProvider {
  baseUrl = 'https://api.openai.com/v1';
  async chat(messages, model, key) { /* ... */ }
}

// Anthropic direto
class AnthropicProvider {
  baseUrl = 'https://api.anthropic.com/v1';
  async chat(messages, model, key) { /* usa /messages endpoint */ }
}

// Gemini direto
class GeminiProvider {
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  async chat(messages, model, key) { /* usa generateContent */ }
}

// Groq (compatível OpenAI — rápido para Whisper e modelos leves)
class GroqProvider {
  baseUrl = 'https://api.groq.com/openai/v1';
  async chat(messages, model, key) { /* endpoint OpenAI-compatible */ }
}

// Kimi / Moonshot (compatível OpenAI)
class KimiProvider {
  baseUrl = 'https://api.moonshot.cn/v1';
  async chat(messages, model, key) { /* endpoint OpenAI-compatible */ }
}

// Ollama local (compatível OpenAI)
class OllamaProvider {
  baseUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434/v1';
  async chat(messages, model, key) { /* sem auth necessária */ }
}
```

### 4.3 Provider Customizado — Injeção pelo Usuário

O usuário pode registrar qualquer API de IA compatível:

```typescript
// Estrutura de um provider customizado
interface CustomAIProvider {
  id: string;
  name: string;           // ex: "Minha empresa AI"
  baseUrl: string;        // ex: "https://ai.minhaempresa.com/v1"
  format: 'openai' | 'anthropic' | 'gemini' | 'custom';
  apiKey: string;         // armazenado no vault
  defaultModel: string;   // ex: "empresa-gpt-v2"
  models: string[];       // modelos disponíveis
  headers?: Record<string, string>; // headers extras se necessário
}

// Salvo em workspace_settings['custom_ai_providers']
// Selecionável no dashboard e pelo chat
```

Via chat (auto-detecção pela doc):
```
/config ai custom
→ Agente pede a URL ou documentação
→ Detecta formato automaticamente (OpenAI-compat, Anthropic, etc.)
→ Pede a chave
→ Testa e salva
```

Via dashboard:
- Aba "Provedores de IA" → "Adicionar provider"
- Preenche: nome, URL, formato, chave, modelos

### 4.4 Seleção de Provider no AIService

```typescript
// src/services/AIService.ts — roteamento de provider

async resolveProvider(agent: Agent): Promise<AIProvider> {
  // 1. Provider customizado do agente (BYOK por agente)
  if (agent.customProviderId) {
    return this.getCustomProvider(agent.customProviderId, agent.tenantId);
  }

  // 2. Provider do workspace
  const workspaceProvider = await settingsService.get(
    agent.tenantId, 'default_provider'
  );

  switch (workspaceProvider) {
    case 'openai':     return new OpenAIProvider();
    case 'anthropic':  return new AnthropicProvider();
    case 'gemini':     return new GeminiProvider();
    case 'groq':       return new GroqProvider();
    case 'kimi':       return new KimiProvider();
    case 'ollama':     return new OllamaProvider();
    default:           return new OpenRouterProvider(); // padrão
  }
}
```

---

## 5. Listagem Dinâmica de Modelos

O dashboard mostra todos os modelos disponíveis dinamicamente — sem lista hardcoded.

```typescript
// src/services/AIService.ts

async listAvailableModels(tenantId: string): Promise<ModelList> {
  const models: ModelList = { openrouter: [], custom: [], local: [] };

  // OpenRouter — busca lista atualizada
  const orKey = await settingsService.get(tenantId, 'openrouter_key');
  if (orKey) {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${orKey}` }
    });
    const data = await res.json();
    models.openrouter = data.data.map(m => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      pricing: m.pricing
    }));
  }

  // Providers customizados do workspace
  const customRaw = await settingsService.get(tenantId, 'custom_ai_providers');
  if (customRaw) {
    const customProviders: CustomAIProvider[] = JSON.parse(customRaw);
    for (const p of customProviders) {
      models.custom.push(...p.models.map(m => ({
        id: `${p.id}/${m}`,
        name: `${p.name}: ${m}`,
        provider: p.name
      })));
    }
  }

  // Ollama local
  const ollamaUrl = await settingsService.get(tenantId, 'ollama_url');
  if (ollamaUrl) {
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`);
      const data = await res.json();
      models.local = data.models.map(m => ({
        id: `ollama/${m.name}`,
        name: `Local: ${m.name}`,
        size: m.size
      }));
    } catch { /* Ollama não disponível */ }
  }

  return models;
}
```

No dashboard o usuário vê uma dropdown com todos os modelos disponíveis, agrupados por provider, sempre atualizada.

---

## 6. Frontend — como consumir as settings

```typescript
// frontend/src/hooks/useSettings.ts

export function useSettings() {
  const { data, mutate } = useSWR('/v1/settings', fetcher);

  const updateSetting = async (key: string, value: string) => {
    await api.put(`/v1/settings/${key}`, { value });
    mutate(); // revalida o cache
  };

  return { settings: data?.settings, updateSetting };
}

// Uso no componente de configuração de IA:
export function AISettingsPanel() {
  const { settings, updateSetting } = useSettings();
  const { data: models } = useSWR('/v1/settings/ai/models', fetcher);

  return (
    <div>
      <ModelSelector
        models={models}
        selected={settings?.default_model}
        onChange={v => updateSetting('default_model', v)}
      />
      <APIKeyInput
        label="OpenRouter Key"
        hasKey={!!settings?.openrouter_key} // mostra só se tem (nunca o valor)
        onSave={v => updateSetting('openrouter_key', v)}
      />
    </div>
  );
}
```

---

## 7. Migration — sem quebrar o que está rodando

Para quem já tem o sistema rodando com `.env`:

```typescript
// src/scripts/migrate-env-to-db.ts
// Roda uma vez na primeira inicialização após atualização

const ENV_TO_SETTINGS_MAP = {
  'OPENROUTER_API_KEY':  { key: 'openrouter_key',  secret: true },
  'OPENAI_API_KEY':      { key: 'openai_key',       secret: true },
  'ANTHROPIC_API_KEY':   { key: 'anthropic_key',    secret: true },
  'GROQ_API_KEY':        { key: 'groq_key',         secret: true },
  'BRAVE_SEARCH_KEY':    { key: 'brave_search_key', secret: true },
  'DEFAULT_MODEL':       { key: 'default_model',    secret: false },
};

export async function migrateEnvToDb(tenantId: string) {
  for (const [envVar, { key, secret }] of Object.entries(ENV_TO_SETTINGS_MAP)) {
    const value = process.env[envVar];
    if (!value) continue;

    // Só migra se ainda não existe no banco
    const existing = await prisma.workspaceSettings.findUnique({
      where: { tenant_id_key: { tenant_id: tenantId, key } }
    });
    if (existing) continue;

    await settingsService.set(tenantId, key, value, secret);
    console.log(`✓ Migrado ${envVar} → ${key}`);
  }
}
```

Executado automaticamente no startup se `LUMI_MIGRATE_ENV=true`.

---

## 8. Checklist de Implementação

```
[ ] Criar tabela workspace_settings com RLS
[ ] Implementar SettingsService (get/set/list)
[ ] API GET /v1/settings e PUT /v1/settings/:key
[ ] API GET /v1/settings/ai/models (dinâmica)
[ ] Atualizar AIService para usar SettingsService
[ ] Implementar providers diretos (OpenAI, Anthropic, Gemini, Groq, Kimi, Ollama)
[ ] Implementar suporte a custom providers
[ ] Atualizar dashboard para buscar settings via API (não .env)
[ ] Script de migration .env → banco
[ ] Remover qualquer leitura de .env do frontend
```
