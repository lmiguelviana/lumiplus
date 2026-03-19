# Fase 26 — Multi-Provider AI: APIs Diretas, Modelos Gratuitos & Fallbacks Configuráveis

Versão: 1.0

---

## A Visão

Hoje o sistema só fala com o **OpenRouter**. O objetivo é suportar **APIs diretas** de cada provedor (Claude, Gemini, GPT, GLM, DeepSeek, Kimi) e também manter o OpenRouter como opção. O usuário escolhe o **provedor + modelo primário** e configura até **5 fallbacks** na ordem que quiser.

```
┌───────────────────────────────────────────────────────┐
│  AGENTE: Lumi Vendas                                   │
│                                                        │
│  Provedor primário: Google Gemini (API Direta)        │
│  Modelo: gemini-2.5-flash                              │
│                                                        │
│  Fallbacks (em ordem):                                 │
│  1. OpenRouter → openai/gpt-4o-mini                   │
│  2. Anthropic → claude-sonnet-4-6               │
│  3. OpenRouter → moonshotai/kimi-k2.5                 │
│  4. DeepSeek → deepseek-chat                          │
│  5. OpenRouter → google/gemini-2.0-flash-001 (grátis) │
└───────────────────────────────────────────────────────┘
```

---

## 1. Provedores Suportados

### APIs Diretas (chave do próprio provedor)

| Provedor | Base URL | Header Auth | Modelos Principais |
|----------|----------|-------------|-------------------|
| **OpenRouter** | `https://openrouter.ai/api/v1/chat/completions` | `Bearer sk-or-...` | Todos os 300+ modelos |
| **Anthropic (Claude)** | `https://api.anthropic.com/v1/messages` | `x-api-key` + `anthropic-version: 2023-06-01` | claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5 |
| **Google (Gemini)** | `https://generativelanguage.googleapis.com/v1beta` | `x-goog-api-key` | gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash |
| **OpenAI (GPT)** | `https://api.openai.com/v1/chat/completions` | `Bearer sk-...` | gpt-4o, gpt-4o-mini, gpt-4.1, o3, o4-mini |
| **DeepSeek** | `https://api.deepseek.com/v1/chat/completions` | `Bearer sk-...` | deepseek-chat, deepseek-reasoner |
| **Zhipu (GLM)** | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `Bearer ...` | glm-4, glm-4-plus, glm-4-flash, glm-5 |
| **Moonshot (Kimi)** | `https://api.moonshot.cn/v1/chat/completions` | `Bearer sk-...` | moonshot-v1-128k, moonshot-v1-32k |

> **Nota**: Claude e Gemini usam formato de request diferente do OpenAI. O sistema precisa de adapters.

### Via OpenRouter (uma chave, todos os modelos)

Todos os provedores acima também podem ser acessados via OpenRouter com prefixo do provedor:
- `anthropic/claude-sonnet-4-6`
- `google/gemini-2.5-flash`
- `openai/gpt-4o`
- `deepseek/deepseek-chat`
- `moonshotai/kimi-k2.5`
- `zhipu/glm-4`

---

## 2. Modelos Gratuitos no OpenRouter (Março 2026)

### Top 10 Recomendados (custo zero)

| Modelo | ID OpenRouter | Contexto | Destaque |
|--------|--------------|----------|----------|
| **Qwen3 Coder 480B** | `qwen/qwen3-coder-480b:free` | 262k | Melhor modelo grátis para código |
| **Gemini 2.0 Flash** | `google/gemini-2.0-flash-exp:free` | 1M | Google, contexto gigante |
| **Llama 3.3 70B** | `meta-llama/llama-3.3-70b-instruct:free` | 128k | Nível GPT-4, general purpose |
| **Qwen3 235B** | `qwen/qwen3-235b-a22b:free` | 128k | MoE potente, raciocínio |
| **DeepSeek V3** | `deepseek/deepseek-chat-v3-0324:free` | 128k | Raciocínio e código |
| **Nemotron 3 Super** | `nvidia/nemotron-3-super:free` | 1M | NVIDIA, 120B params |
| **Kimi K2 Free** | `moonshotai/kimi-k2:free` | 128k | Moonshot, multiuso |
| **Phi-4 Reasoning** | `microsoft/phi-4-reasoning-plus:free` | 32k | Microsoft, raciocínio |
| **Mistral Small** | `mistralai/mistral-small-3.1-24b:free` | 96k | Rápido e eficiente |
| **OpenRouter Auto Free** | `openrouter/free` | — | Roteador automático grátis |

### Limites dos modelos gratuitos
- ~20 requests/minuto
- ~200 requests/dia
- Disponibilidade pode variar (não recomendado para produção pesada)

---

## 3. Sistema de 5 Fallbacks Configuráveis

### Como funciona hoje
```typescript
// Atual: hardcoded, só OpenRouter
selectedModels = [agent.primaryModel, ...agent.fallbackModels].slice(0, 5);
// Tudo vai pro OpenRouter — sem suporte a APIs diretas
```

### Como vai funcionar
```typescript
// Novo: cada fallback tem provedor + modelo + chave
interface ModelConfig {
  provider: 'openrouter' | 'anthropic' | 'google' | 'openai' | 'deepseek' | 'zhipu' | 'moonshot';
  model: string;       // "gemini-2.5-flash" ou "openai/gpt-4o" (OpenRouter)
  apiKeySettingKey: string; // "google_key" → busca em WorkspaceSetting
}

// Agent tem:
// primaryModel: ModelConfig
// fallbacks: ModelConfig[] (até 5)
```

### Fluxo de execução com fallbacks
```
1. Tenta primaryModel (ex: Google Gemini direto)
   → Sucesso? Retorna
   → Falha (timeout, rate limit, erro)?

2. Tenta fallback[0] (ex: OpenRouter → GPT-4o-mini)
   → Sucesso? Retorna
   → Falha?

3. Tenta fallback[1] (ex: Anthropic → Claude Haiku)
   → Sucesso? Retorna
   → Falha?

4. ... até fallback[4]

5. Todos falharam → retorna erro ao usuário
```

### Schema Prisma (alteração no Agent)
```prisma
model Agent {
  // ... campos existentes ...

  // ANTES:
  // primaryModel    String   @default("openai/gpt-4o")
  // fallbackModels  String[]

  // DEPOIS:
  primaryProvider   String   @default("openrouter") @map("primary_provider")
  primaryModel      String   @default("google/gemini-2.0-flash-001") @map("primary_model")
  fallbackConfig    Json     @default("[]") @map("fallback_config")
  // fallbackConfig = [
  //   { "provider": "openrouter", "model": "openai/gpt-4o-mini" },
  //   { "provider": "anthropic", "model": "claude-haiku-4-5" },
  //   { "provider": "openrouter", "model": "moonshotai/kimi-k2:free" },
  //   { "provider": "deepseek", "model": "deepseek-chat" },
  //   { "provider": "openrouter", "model": "google/gemini-2.0-flash-exp:free" }
  // ]
}
```

---

## 4. Adapters por Provedor

Cada provedor tem formato de request diferente. O sistema precisa de adapters:

### OpenAI-Compatible (OpenRouter, OpenAI, DeepSeek, Moonshot, Zhipu)
```typescript
// Formato padrão — funciona direto
{
  model: "gpt-4o",
  messages: [{ role: "system", content: "..." }, { role: "user", content: "..." }],
  tools: [...],
  max_tokens: 1000
}
```

### Anthropic (Claude) — Formato diferente
```typescript
// Claude usa formato próprio
{
  model: "claude-sonnet-4-6",
  system: "...",                    // system prompt separado
  messages: [{ role: "user", content: "..." }],
  tools: [...],                      // formato diferente do OpenAI
  max_tokens: 1024
}
// Headers: x-api-key + anthropic-version: 2023-06-01
```

### Google (Gemini) — Formato diferente
```typescript
// Gemini usa formato próprio
{
  contents: [{ role: "user", parts: [{ text: "..." }] }],
  systemInstruction: { parts: [{ text: "..." }] },
  tools: [{ functionDeclarations: [...] }],
  generationConfig: { maxOutputTokens: 1000 }
}
// URL: /v1beta/models/gemini-2.5-flash:generateContent?key=API_KEY
```

### Classe ProviderAdapter
```typescript
abstract class ProviderAdapter {
  abstract name: string;
  abstract formatRequest(messages: ChatMessage[], tools: Tool[], model: string): any;
  abstract parseResponse(data: any): { content: string; model: string; tokensUsed: number };
  abstract getEndpoint(model: string): string;
  abstract getHeaders(apiKey: string): Record<string, string>;
}

class OpenAIAdapter extends ProviderAdapter { ... }     // OpenAI, DeepSeek, Moonshot, Zhipu
class AnthropicAdapter extends ProviderAdapter { ... }  // Claude
class GeminiAdapter extends ProviderAdapter { ... }     // Gemini
class OpenRouterAdapter extends OpenAIAdapter { ... }   // Herda de OpenAI + headers extras
```

---

## 5. Página de Configurações — Chaves por Provedor

### Novo layout da página Config
```
┌─────────────────────────────────────────────────────┐
│  ⚙️ Configurações do Workspace                      │
│                                                      │
│  🤖 Provedores de IA                                │
│  ├── OpenRouter Key        [sk-or-v1-•••••] [Salvar]│
│  ├── Anthropic Key (Claude)[sk-ant-•••••]   [Salvar]│
│  ├── Google AI Key (Gemini)[AIza••••••]     [Salvar]│
│  ├── OpenAI Key (GPT)     [sk-•••••]       [Salvar]│
│  ├── DeepSeek Key          [sk-•••••]       [Salvar]│
│  ├── Zhipu Key (GLM)      [•••••]          [Salvar]│
│  ├── Moonshot Key (Kimi)   [sk-•••••]       [Salvar]│
│  └── Groq Key (Whisper)    [gsk_•••••]      [Salvar]│
│                                                      │
│  🔍 Ferramentas & Busca                             │
│  ├── Brave Search Key      [BSA•••••]       [Salvar]│
│  └── Brevo Key (Email)     [xkeysib-•••]    [Salvar]│
│                                                      │
│  🎨 Aparência                                       │
│  └── Tema: [Dark ▼]                                 │
│                                                      │
│  💡 Dica: Você só precisa de UMA chave de IA.       │
│  OpenRouter dá acesso a todos os modelos com uma     │
│  única chave. As chaves diretas são opcionais e      │
│  oferecem menor latência + preços melhores.          │
└─────────────────────────────────────────────────────┘
```

### Chaves no WorkspaceSetting
```
openrouter_key   → OpenRouter (gateway universal)
anthropic_key    → Anthropic (Claude direto)
google_ai_key    → Google Gemini (direto)
openai_key       → OpenAI (GPT direto)
deepseek_key     → DeepSeek (direto)
zhipu_key        → Zhipu/GLM (direto)
moonshot_key     → Moonshot/Kimi (direto)
groq_key         → Groq (Whisper transcrição)
brave_search_key → Brave Search
brevo_key        → Brevo (email)
```

---

## 6. UI de Fallbacks no Agente

### Na página de edição do agente
```
┌─────────────────────────────────────────────────────┐
│  🧠 Modelo de Inteligência                          │
│                                                      │
│  Provedor: [OpenRouter ▼]                           │
│  Modelo:   [google/gemini-2.0-flash-001 ▼]          │
│                                                      │
│  ⚡ Fallbacks (arrastar para reordenar):            │
│  ┌─────────────────────────────────────────────┐    │
│  │ 1. [OpenRouter ▼] [openai/gpt-4o-mini ▼]  🗑│    │
│  │ 2. [Anthropic ▼]  [claude-haiku-4-5 ▼]  🗑│    │
│  │ 3. [OpenRouter ▼] [moonshotai/kimi-k2:free]🗑│    │
│  │ 4. [DeepSeek ▼]   [deepseek-chat ▼]       🗑│    │
│  │ 5. [OpenRouter ▼] [meta-llama/llama-3.3 ▼]🗑│    │
│  └─────────────────────────────────────────────┘    │
│  [+ Adicionar fallback]                              │
│                                                      │
│  ☑ Modo economia (prioriza modelos baratos/grátis)  │
│                                                      │
│  💡 Modelos gratuitos disponíveis:                   │
│  qwen3-coder-480b, gemini-2.0-flash, llama-3.3-70b, │
│  kimi-k2, deepseek-v3, nemotron-3-super             │
└─────────────────────────────────────────────────────┘
```

### Catálogo de modelos por provedor

```typescript
const MODEL_CATALOG = {
  openrouter: {
    label: 'OpenRouter (Universal)',
    settingKey: 'openrouter_key',
    models: [
      // Premium
      { id: 'openai/gpt-4o', name: 'GPT-4o', free: false },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', free: false },
      { id: 'openai/gpt-4.1', name: 'GPT-4.1', free: false },
      { id: 'openai/o4-mini', name: 'O4 Mini', free: false },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', free: false },
      { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', free: false },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', free: false },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', free: false },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', free: false },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', free: false },
      { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', free: false },
      { id: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2 Thinking', free: false },
      { id: 'moonshotai/kimi-k2-0905', name: 'Kimi K2', free: false },
      // Gratuitos
      { id: 'qwen/qwen3-coder-480b:free', name: 'Qwen3 Coder 480B', free: true },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', free: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', free: true },
      { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B', free: true },
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3', free: true },
      { id: 'nvidia/nemotron-3-super:free', name: 'Nemotron 3 Super', free: true },
      { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2', free: true },
      { id: 'microsoft/phi-4-reasoning-plus:free', name: 'Phi-4 Reasoning', free: true },
      { id: 'mistralai/mistral-small-3.1-24b:free', name: 'Mistral Small 3.1', free: true },
      { id: 'openrouter/free', name: 'Auto Free (Roteador)', free: true },
    ]
  },
  anthropic: {
    label: 'Anthropic (Claude Direto)',
    settingKey: 'anthropic_key',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', free: false },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', free: false },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', free: false },
    ]
  },
  google: {
    label: 'Google (Gemini Direto)',
    settingKey: 'google_ai_key',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', free: false },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', free: false },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', free: false },
    ]
  },
  openai: {
    label: 'OpenAI (GPT Direto)',
    settingKey: 'openai_key',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', free: false },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', free: false },
      { id: 'gpt-4.1', name: 'GPT-4.1', free: false },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', free: false },
      { id: 'o3', name: 'O3 (Reasoning)', free: false },
      { id: 'o4-mini', name: 'O4 Mini (Reasoning)', free: false },
    ]
  },
  deepseek: {
    label: 'DeepSeek (Direto)',
    settingKey: 'deepseek_key',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', free: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoning)', free: false },
    ]
  },
  zhipu: {
    label: 'Zhipu (GLM Direto)',
    settingKey: 'zhipu_key',
    models: [
      { id: 'glm-5', name: 'GLM-5', free: false },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', free: false },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', free: false },
    ]
  },
  moonshot: {
    label: 'Moonshot (Kimi Direto)',
    settingKey: 'moonshot_key',
    models: [
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128k', free: false },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32k', free: false },
    ]
  }
};
```

---

## 7. Checklist de Implementação

### Backend
```
[x] ProviderAdapter interface + factory (Strategy Pattern) ✅ 18/03/2026
[x] OpenAICompatibleAdapter (OpenRouter, OpenAI, DeepSeek, Moonshot, Zhipu) ✅ 18/03/2026
[x] AnthropicAdapter (system separado, x-api-key, anthropic-version) ✅ 18/03/2026
[x] GeminiAdapter (contents, systemInstruction, x-goog-api-key) ✅ 18/03/2026
[x] Refatorar AIService.complete() — fallback sequencial multi-provider ✅ 18/03/2026
[x] Campo primaryProvider no Agent (Prisma db push) ✅ 18/03/2026
[x] Campo fallbackConfig (Json) no Agent ✅ 18/03/2026
[x] PROVIDER_SETTING_KEYS — chaves por provedor ✅ 18/03/2026
[x] Log de qual provedor/modelo respondeu ✅ 18/03/2026
[x] Timeout 30s por tentativa + pula pro próximo fallback ✅ 18/03/2026
[x] PATCH /dashboard/agents aceita primaryProvider + fallbackConfig ✅ 18/03/2026
```

### Frontend
```
[x] Catálogo de modelos com optgroup Premium + Gratuitos ✅ 18/03/2026
[x] Select atualizado na criação de agente (14 modelos) ✅ 18/03/2026
[x] Select atualizado na edição de agente (14 modelos) ✅ 18/03/2026
[x] Novas chaves na página Config: anthropic_key, google_ai_key, openai_key, deepseek_key ✅ 18/03/2026
[x] Dica visual: "Só precisa de uma chave (OpenRouter)" ✅ 18/03/2026
[ ] UI de fallbacks (até 5) — drag-and-drop para reordenar (futuro)
```

---

## 8. Compatibilidade com OpenRouter existente

- **Quem só tem OpenRouter key**: continua funcionando exatamente igual
- **Quem quer API direta**: configura a chave do provedor + seleciona no agente
- **Fallback misto**: pode misturar OpenRouter + APIs diretas na cadeia de fallback
- **Modo economia**: prioriza modelos `:free` do OpenRouter automaticamente

---

## 9. Prioridade de Execução

| Ordem | Item | Justificativa |
|-------|------|---------------|
| 1 | ProviderAdapter + OpenAICompatible | Base para tudo — OpenRouter, OpenAI, DeepSeek já funcionam |
| 2 | AnthropicAdapter | Claude é top tier, muita demanda |
| 3 | GeminiAdapter | Google Gemini tem modelos grátis excelentes |
| 4 | Fallback sequencial no AIService | Motor de resiliência |
| 5 | UI de fallbacks no agente | Usuário configura visualmente |
| 6 | Novas chaves no Config | Cada provedor com sua chave |
| 7 | Catálogo de modelos com badge grátis | UX informativa |
