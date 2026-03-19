# Fase 35: Auto-Configuração, Workflows Refatorados & Suporte SQLite
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

Conjunto de melhorias estruturais: skill de auto-configuração de agentes, suporte a SQLite para instalação local, refatoração da página de Workflows com foco em agentes, e correções de estabilidade no AIService e Dashboard.

---

## 1. Skill: Auto-Configuração (`self_configure`)

A skill mais poderosa do sistema — permite que o agente se configure **sozinho** quando recebe documentação de uma API ou instrução do usuário.

### Ações disponíveis

| Ação | O que faz |
|------|-----------|
| `update_soul` | Atualiza o system prompt / identidade do agente no banco e KnowledgeService |
| `install_skill` | Ativa uma skill pelo ID no AgentSkill do banco |
| `save_credential` | Salva uma API key de forma criptografada no vault do workspace |

### Tool Definition

```typescript
{
  name: 'self_configure',
  description: 'Auto-configura o agente: atualiza soul/identidade, instala skills ou salva credenciais de APIs.',
  parameters: {
    type: 'object',
    properties: {
      action: { enum: ['update_soul', 'install_skill', 'save_credential'] },
      soul: { type: 'string', description: 'Novo system prompt (usar em update_soul)' },
      skill_id: { type: 'string', description: 'ID da skill a instalar (usar em install_skill)' },
      credential_key: { type: 'string', description: 'Nome da credencial (usar em save_credential)' },
      credential_value: { type: 'string', description: 'Valor da credencial (usar em save_credential)' },
    },
    required: ['action'],
  },
}
```

### System Prompt Addition

```
Você tem AUTO-CONFIGURAÇÃO ativa. Isso funciona tanto no chat web quanto pelo Telegram ou WhatsApp.

QUANDO agir automaticamente:
- Usuário enviar uma API key, token ou credencial → use self_configure(action="save_credential") imediatamente
- Usuário pedir para você instalar uma skill/ferramenta → use self_configure(action="install_skill")
- Usuário pedir para você mudar sua personalidade, tom ou instruções → use self_configure(action="update_soul")
- Usuário enviar documentação de uma API → leia (scrape_url ou knowledge_search), salve a credencial e atualize seu soul

FLUXO PADRÃO ao receber uma API + documentação:
1. self_configure(action="save_credential", credential_key="nome_api_key", credential_value="valor")
2. Leia a documentação se fornecida
3. self_configure(action="update_soul") com instruções sobre como usar essa API
4. Confirme ao usuário os passos executados

Sempre use nomes de credencial no formato snake_case (ex: gerarthumbs_api_key, ckato_token).
Confirme cada ação ao usuário de forma clara e objetiva.
```

### Handler (registry.ts)

```typescript
self_configure: async (args, ctx) => {
  const { action, soul, skill_id, credential_key, credential_value } = args;

  if (action === 'update_soul') {
    await prisma.agent.update({ where: { id: ctx.agentId }, data: { systemPrompt: soul.trim() } });
    await KnowledgeService.setSoul(ctx.tenantId, ctx.agentId, soul.trim());
    return `✅ Soul atualizado com sucesso.`;
  }

  if (action === 'install_skill') {
    await SkillRegistry.activate(ctx.tenantId, ctx.agentId, skill_id);
    return `✅ Skill "${SKILL_CATALOG[skill_id].name}" instalada e ativa.`;
  }

  if (action === 'save_credential') {
    await settingsService.set(ctx.tenantId, credential_key, credential_value, true);
    return `✅ Credencial "${credential_key}" salva com segurança no vault do workspace.`;
  }
}
```

### Fluxo Completo: Agente se auto-configura com API externa

```
Usuário → "Aqui está a API do GeraThumbs: https://docs.gerarthumbs.com"
     ↓
Agente:
  1. scrape_url("https://docs.gerarthumbs.com") → lê documentação
  2. Pede a API key ao usuário
  3. self_configure(save_credential, "gerarthumbs_key", "sk-xxx")
  4. self_configure(install_skill, "call_api")
  5. self_configure(update_soul, "<novo prompt com instruções da API>")
     ↓
Agente agora sabe usar a API autonomamente em futuras conversas.
```

### Integração com Canais (Web, Telegram, WhatsApp)

`self_configure` está **integrado ao AIService**, o orquestrador central de todas as conversas. Funciona em:

| Canal | Como funciona | Exemplo |
|-------|---------------|---------|
| **Web Chat** | POST /chat → AIService.complete() | Agente usa tools no editor web |
| **Telegram** | Mensagem texto → TelegramService → AIService.complete() | `/start` ou mensagem simples |
| **WhatsApp** | Mensagem texto → WhatsAppService → AIService.complete() | Resposta em grupo ou 1-a-1 |

Fluxo geral:
```
Canal (Web/TG/WA)
    ↓
Handler (ai.routes.ts / telegram.service.ts / whatsapp.service.ts)
    ↓
HistoryService (salva conversa)
    ↓
AIService.complete()
    ├─ Sistema injetor: soul + skills ativas
    ├─ Recupera tools via SkillRegistry.getActiveTools()
    ├─ Chama LLM com self_configure como tool disponível
    ├─ LLM decide chamar self_configure se apropriado
    ├─ SkillRegistry.execute() roda o handler
    └─ Resposta volta ao canal

Resultado: agente se auto-configura em qualquer canal de forma idêntica.
```

### Sistema Prompt: Detecção de Canal

O agente recebe informação do canal via sistema prompt:

```typescript
// ai.service.ts, linhas 43-44
const channelLabel = channel === 'telegram' ? 'Telegram'
                    : channel === 'whatsapp' ? 'WhatsApp'
                    : channel === 'web' ? 'Chat Web' : '';
const channelInfo = channelLabel
  ? `\nVocê está conversando com o usuário via ${channelLabel}...`
  : '';
```

Assim, agente sabe qual canal está usando e pode adaptar respostas se necessário.

### Checklist
```
[x] Skill definida no SKILL_CATALOG (catalog.ts) — isDefault: true (todos agentes têm)
[x] Handler implementado no SKILL_HANDLERS (registry.ts)
[x] update_soul: atualiza agent.systemPrompt + KnowledgeService.setSoul
[x] install_skill: chama SkillRegistry.activate()
[x] save_credential: chama settingsService.set() + cria agentSkill "custom:*"
[x] Logs via logger.info em cada ação
[x] Validação: soul vazio bloqueado, skill_id inexistente bloqueado
[x] Custom skills visible na aba "Personalizadas" do marketplace
[x] Auto-sincronização: agentes existentes recebem novas default skills automaticamente
[x] Funciona em todos os canais: web chat, Telegram, WhatsApp
```

### UI — Aba "Personalizadas" no Marketplace

Quando um agente usa `self_configure(save_credential)`, aparece uma card na aba "Personalizadas" mostrando:

```
┌──────────────────────────────┐
│ ⚡ GERARTHUMBS API           │
│  Auto-Configurada             │
│                               │
│  Credencial: gerarthumbs_key  │
│                               │
│  Agentes com acesso:          │
│  🤖 Thulio    @thulio    [🗑] │
│  🤖 Raphael   @raphael   [🗑] │
└──────────────────────────────┘
```

- **Badge purple** diferenciando de skills do marketplace
- **Contador** na aba "Personalizadas" mostrando total de APIs
- **Botão lixeira** para revogar acesso de um agente
- **Estado vazio** se nenhuma custom skill foi criada, com instrução de uso

### Backend — Endpoints

```typescript
// GET /skills/custom
// Retorna: { customSkills: Array<{
//   skillId: "custom:gerarthumbs_key",
//   apiName: "Gerarthumbs",
//   credentialKey: "gerarthumbs_key",
//   agents: [{id, name, slug}],
//   createdAt
// }> }

// DELETE /skills/custom/:skillId/agent/:agentId
// Remove um agente da custom skill
```

### Backend — Modificação de self_configure

Quando `save_credential` é chamado:

1. Salva credencial no vault (como antes)
2. **Novo**: Cria registro `agentSkill` com `skillId = "custom:{credential_key}"`
3. Config armazena: `{ credentialKey, apiName, installedBy: "self_configure" }`

```typescript
const apiName = credential_key
  .replace(/_api_key$|_key$|_secret$|_token$/i, '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (c: string) => c.toUpperCase());

await prisma.agentSkill.upsert({
  where: { agentId_skillId: { agentId, skillId: `custom:${credential_key}` } },
  create: {
    tenantId,
    agentId,
    skillId: `custom:${credential_key}`,
    enabled: true,
    config: { credentialKey: credential_key, apiName, installedBy: 'self_configure' },
  },
  update: { enabled: true, config: {...} },
});
```

---

## 2. Suporte SQLite — Schema & Database Abstraction

O sistema era exclusivo para PostgreSQL. Para instalação local (sem VPS/Supabase), adicionado suporte completo a SQLite.

### Schema SQLite (`backend/prisma/schema.sqlite.prisma`)

Diferenças vs schema.prisma principal:

| Tipo PG | Tipo SQLite |
|---------|-------------|
| `String[]` | `String @default("[]")` (JSON string) |
| `Json` | `String` |
| `@db.VarChar(100)` | Removido |
| `Unsupported("vector(1536)")` | `String?` (pgvector não disponível) |
| `provider = "postgresql"` | `provider = "sqlite"` |

### Database Abstraction (`backend/src/lib/database.ts`)

```typescript
export type DatabaseProvider = 'postgresql' | 'sqlite';

export function getDatabaseProvider(): DatabaseProvider {
  const url = process.env.DATABASE_URL || '';
  if (url.startsWith('file:') || url.endsWith('.db') || url.includes('sqlite')) {
    return 'sqlite';
  }
  return 'postgresql';
}

export const isPostgres = () => getDatabaseProvider() === 'postgresql';
export const isSQLite = () => getDatabaseProvider() === 'sqlite';
```

### Uso no KnowledgeService

```typescript
// Antes: env.DATABASE_URL.startsWith('postgres')
// Depois:
import { isPostgres as checkPostgres } from '../lib/database.js';

if (checkPostgres()) {
  // pgvector: SELECT embedding <=> $1 ...
} else {
  // SQLite: busca por texto simples (sem vetores)
}
```

### Checklist
```
[x] Criar schema.sqlite.prisma compatível
[x] Criar src/lib/database.ts com getDatabaseProvider()
[x] Refatorar KnowledgeService para usar checkPostgres()
[x] SQLite: fallback de busca semântica → busca por texto
[x] Documentar: DATABASE_URL=file:./lumi.db para SQLite
```

---

## 3. AgentSquadService — Squad Automática por Agente

Cada agente passa a ter sua própria squad, criada automaticamente na criação.

### Lógica

```
Agente criado → squad "<AgentName> Squad" criada
Agent é o líder da squad (role: "leader")
Usuário pode adicionar/remover membros via /squad add <agente>
Squad é usada dentro do canvas de Workflow (não é seção separada)
```

### API do Service (`agent-squad.service.ts`)

```typescript
class AgentSquadService {
  static createDefaultSquad(tenantId, agentId, agentName)  // cria squad com agente como líder
  static getAgentSquad(tenantId, agentId)                   // squad onde agente é líder
  static addMember(tenantId, leaderAgentId, memberAgentId)  // adiciona trabalhador à squad
  static removeMember(tenantId, leaderAgentId, memberAgentId)
  static execute(tenantId, agentId, task)                   // executa task via SwarmService
  static ensureSquad(tenantId, agentId, agentName)          // idempotente — cria se não existir
}
```

### Auto-criação (dashboard.routes.ts)

```typescript
// Em 3 pontos: criação manual, from-template e import
const agent = await prisma.agent.create({ ... });
const { AgentSquadService } = await import('../services/agent-squad.service.js');
await AgentSquadService.createDefaultSquad(tenantId, agent.id, agent.name).catch(e => {
  console.warn('[Dashboard] Falha ao criar squad padrão:', e.message);
});
```

### Comando /squad expandido (command.service.ts)

```
/squad                    → mostra squad do agente ativo
/squad add <agente>       → adiciona membro à squad
/squad remover <agente>   → remove membro da squad
/squad executar <tarefa>  → executa task com a squad inteira
/squad exec <tarefa>      → alias de executar
```

Agentes antigos sem squad recebem uma automaticamente no primeiro `/squad`.

### Checklist
```
[x] AgentSquadService criado em src/services/agent-squad.service.ts
[x] createDefaultSquad() — cria Squad + SquadMember(role: leader)
[x] getAgentSquad() — busca squad do líder com membros
[x] addMember() / removeMember() — gestão de membros
[x] execute() — delega para SwarmService
[x] ensureSquad() — idempotente
[x] Auto-criação em dashboard.routes.ts (3 pontos de criação de agente)
[x] /squad add, /squad remover, /squad executar no CommandService
[x] Fallback: agente antigo sem squad → auto-cria no primeiro /squad
```

---

## 4. Workflows — Refatoração da Página

A página de Workflows foi reestruturada para refletir a arquitetura correta:
**Agente → seus Workflows** (squad vive dentro do canvas, não em aba separada).

### Antes
```
Tabs: [Workflows] [Tools] [Squads]
- Workflows: lista global
- Tools: aba sem lógica clara
- Squads: seção separada confusa
```

### Depois
```
Sidebar esquerda:
  [Lista de Agentes]
    → clica agente → mostra seus Workflows
    → botão "+ Novo Workflow" por agente

Área principal:
  → Lista de workflows do agente selecionado
  → Cada workflow: nome + botão [🗑 Deletar] + botão [▶ Executar]
```

### API Changes (workflows.routes.ts)

```typescript
// Novo endpoint: Criar workflow vazio
POST /workflows
Body: { name, description, trigger, definition }

// Novo endpoint: Deletar workflow + cascade
DELETE /workflows/:id
// Cascade: humanApprovals → spawnedAgents → workflowTasks → workflowRuns → workflow
```

### Fix: Agentes não carregavam

```typescript
// Antes (quebrava com array direto):
const agents = data.agents || [];

// Depois (suporta ambos os formatos):
const agents = Array.isArray(data) ? data : data.agents || [];
```

### Checklist
```
[x] Remover abas Tools e Squads da página de Workflows
[x] Sidebar: lista de agentes → selecionar → ver workflows do agente
[x] Botão "+ Novo Workflow" por agente
[x] Botão Deletar (Trash2) em cada workflow
[x] Fix: Array.isArray(data) para suportar resposta direta
[x] POST /workflows — criar workflow vazio
[x] DELETE /workflows/:id — deletar com cascade completo
[x] handleSelectAgent() que busca squad + workflows do agente
```

---

## 5. Correções AIService & Frontend

### Prompt Truncation (ai.service.ts)

Modelos gratuitos do OpenRouter têm limite de ~5k tokens. O sistema enviava prompts gigantes causando erro 402.

```typescript
const MAX_PROMPT_TOKENS = 4000;
const estimateTokens = (msgs) => msgs.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);

let estimatedTokens = estimateTokens(finalMessages);
if (estimatedTokens > MAX_PROMPT_TOKENS) {
  // Mantém: primeiro system prompt + últimas 6 mensagens do usuário
  const essentialSystem = systemContext.slice(0, 1);
  const userMessages = messages.slice(-6);
  finalMessages = [...essentialSystem, ...userMessages];
}
```

### Erro 402 melhorado

```typescript
// Antes: "Sem créditos em openrouter"
// Depois: mostra o erro real do OpenRouter
if (res.status === 402) {
  const errBody = await res.json().catch(() => ({}));
  const detail = errBody?.error?.message || errBody?.message || 'Sem créditos';
  throw new Error(detail);
}
```

### next.config.ts

O arquivo estava vazio. Agora configurado com:
- Proxy `/api/*` → backend (evita CORS)
- Image optimization com remote patterns
- Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- `reactStrictMode: true`, `poweredByHeader: false`

### Agentes Page — Fixes (agents/page.tsx)

| Item | Antes | Depois |
|------|-------|--------|
| Import | `Users` não importado → crash | Adicionado ao import do lucide-react |
| Economy Mode | Label "Economy Mode" | "Modo Econômico" |
| Badge | "ECONOMY" | "CUSTO REDUZIDO" |
| Descrição | Texto genérico | "Prioriza modelos baratos antes do principal" |

### Checklist
```
[x] Prompt truncation: MAX_PROMPT_TOKENS = 4000 no AIService
[x] Truncação mantém essentialSystem[0] + messages.slice(-6)
[x] Erro 402: exibe mensagem real do OpenRouter (não sobrescreve com genérico)
[x] next.config.ts: proxy + security headers + imageRemotePatterns
[x] Fix: Users importado em agents/page.tsx
[x] Rename: Economy Mode → Modo Econômico (label + badge + descrição)
```

---

## 6. Arquitetura de Canais — Isolamento por Agente

Confirmado e documentado: cada agente tem instância **completamente isolada** de cada canal.

```
ChannelManager:
  chave: "{agentId}:{channelType}"
  ex: "agent-123:telegram" → bot próprio, token próprio
  ex: "agent-456:telegram" → bot diferente, token diferente

O usuário A que fala com o Agente 1 via Telegram
NUNCA vê mensagens do Agente 2, mesmo no mesmo workspace.
```

Isso significa:
- 1 agente = 1 bot do Telegram (se configurado)
- 1 agente = 1 número WhatsApp (se configurado)
- Isolamento completo de conversas, histórico e identidade

---

## 7. Checklist Final

```
[x] self_configure skill — update_soul, install_skill, save_credential
[x] Modificação: save_credential cria agentSkill com skillId "custom:*"
[x] Endpoint: GET /skills/custom — retorna custom skills groupadas
[x] Endpoint: DELETE /skills/custom/:skillId/agent/:agentId
[x] Frontend: nova aba "Personalizadas" no Skills Marketplace
[x] UI: cards roxos para custom skills, lista de agentes com lixeira
[x] UI: estado vazio com instrução de uso
[x] AgentSquadService criado + auto-criação em dashboard.routes.ts
[x] /squad add|remover|executar no CommandService
[x] Workflows page refatorada (sidebar Agentes, botão novo, botão deletar)
[x] SQLite: schema.sqlite.prisma + database.ts
[x] Prompt truncation: MAX_PROMPT_TOKENS = 4000 no AIService
[x] Erro 402: mostra mensagem real do OpenRouter
[x] next.config.ts: proxy + security headers + imageRemotePatterns
[x] Agentes page: fix Users import + "Modo Econômico"
```

---

## 8. Prioridade

| Ordem | Item | Status |
|-------|------|--------|
| 1 | self_configure skill | ✅ Implementado |
| 2 | Custom Skills tab (Personalizadas) | ✅ Implementado |
| 3 | AgentSquadService + auto-criação | ✅ Implementado |
| 4 | Workflows page refatorada | ✅ Implementado |
| 5 | SQLite support | ✅ Implementado |
| 6 | Prompt truncation + erro 402 | ✅ Implementado |
| 7 | next.config.ts + agents fixes | ✅ Implementado |
