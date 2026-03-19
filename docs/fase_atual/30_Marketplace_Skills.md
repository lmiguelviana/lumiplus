# Fase 30: Marketplace de Skills — Integrações Instaláveis por Agente
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

Transformar as skills dos agentes num **marketplace de integrações** — o usuário escolhe quais capacidades cada agente tem. Algumas skills vêm pré-instaladas, outras o usuário ativa conforme precisa.

Hoje o agente tem skills fixas (web_search, knowledge_search, scrape_url, write_memory, escalate_human). Com o marketplace:
- Cada skill é um pacote com: instrução pro system prompt + tool definition + handler
- O usuário ativa/desativa por agente
- Skills pré-instaladas funcionam out-of-the-box
- Skills de terceiros (API) pedem credenciais na ativação

---

## 1. Catálogo de Skills

### Skills Nativas (pré-instaladas, sem config)

| Skill | ID | O que faz | Precisa de chave? |
|-------|----|-----------|--------------------|
| Busca Web | `web_search` | Pesquisa na internet em tempo real | Brave Search key (ou DuckDuckGo grátis) |
| Busca no Conhecimento | `knowledge_search` | RAG na base de docs do agente | Não |
| Scraping de URL | `scrape_url` | Extrai conteúdo de uma página web | Não |
| Salvar Memória | `write_memory` | Agente salva informações para lembrar depois | Não |
| Escalação Humana | `escalate_human` | Transfere conversa para atendente humano | Não |
| Auto-Aprendizado | `self_improving` | Aprende com erros e correções do usuário | Não |
| DuckDuckGo | `duckduckgo_search` | Busca web gratuita sem API key | Não |

### Skills de Integração (ativa e configura credenciais)

| Skill | ID | O que faz | Credenciais |
|-------|----|-----------|--------------|
| Google Calendar | `google_calendar` | Agendar, listar, cancelar eventos | Google OAuth / API Key |
| Google Sheets | `google_sheets` | Ler/escrever planilhas, criar relatórios | Google OAuth / API Key |
| Trello | `trello` | Gerenciar quadros, listas e cards | Trello API Key + Token |
| Email (SMTP) | `email_send` | Enviar emails transacionais | SMTP host + user + pass |
| Email (IMAP) | `email_read` | Ler emails da caixa de entrada | IMAP host + user + pass |
| Stripe | `stripe` | Consultar pagamentos, clientes, faturas | Stripe Secret Key |
| Notion | `notion` | Ler/criar páginas e databases | Notion API Key |
| Airtable | `airtable` | CRUD em bases de dados | Airtable API Key |
| Calendly | `calendly` | Verificar disponibilidade, agendar | Calendly API Key |
| HubSpot | `hubspot` | CRM — contatos, deals, empresas | HubSpot API Key |

### Skills Futuras (roadmap)

| Skill | ID | O que faz |
|-------|----|-----------|
| Instagram DM | `instagram` | Responder DMs do Instagram |
| Shopify | `shopify` | Consultar pedidos, produtos, estoque |
| Mercado Livre | `mercadolivre` | Consultar anúncios, vendas |
| PIX/Pagamentos | `pix` | Gerar cobranças PIX |
| PDF Generator | `pdf_generate` | Criar PDFs (propostas, contratos) |
| WhatsApp Catalog | `wa_catalog` | Enviar catálogo de produtos no WhatsApp |

---

## 2. Estrutura de uma Skill

Cada skill é um objeto com 4 partes:

```typescript
interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;               // lucide icon name
  category: 'native' | 'integration' | 'communication';
  isDefault: boolean;          // vem ativada por padrão?

  // 1. Credenciais necessárias
  credentials: Array<{
    key: string;               // ex: 'trello_api_key'
    label: string;
    placeholder: string;
    required: boolean;
  }>;

  // 2. Tool definition (OpenAI format)
  tool: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: object;
    };
  };

  // 3. Instrução pro system prompt
  systemPromptAddition: string;

  // 4. Handler (função que executa)
  handler: (args: any, context: SkillContext) => Promise<string>;
}

interface SkillContext {
  tenantId: string;
  agentId: string;
  credentials: Record<string, string>; // credenciais descriptografadas
}
```

---

## 3. Skill: Self-Improving Agent (Auto-Aprendizado)

A skill mais poderosa — agente que melhora sozinho:

### Como funciona

```
1. Agente erra ou é corrigido pelo usuário
   ↓
2. Skill detecta padrão:
   - "Não, na verdade é..." → CORRECTION
   - "Você não sabe fazer X?" → KNOWLEDGE_GAP
   - Erro na API/tool → ERROR
   ↓
3. Registra no Knowledge do agente:
   - Tipo: learning | error | feature_request
   - Conteúdo: o que aprendeu
   - Contexto: conversa onde ocorreu
   ↓
4. Próxima conversa → RAG encontra o aprendizado
   → Agente não repete o erro
```

### Tool definition

```typescript
{
  name: 'learn_from_interaction',
  description: 'Registra um aprendizado, correção ou erro para não repetir no futuro',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['correction', 'knowledge_gap', 'error', 'best_practice'] },
      title: { type: 'string', description: 'Resumo curto do aprendizado' },
      details: { type: 'string', description: 'Detalhes do que aprendeu e como aplicar' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['type', 'title', 'details'],
  },
}
```

### System prompt addition

```
Você tem capacidade de AUTO-APRENDIZADO. Quando:
- O usuário te corrigir ("não, na verdade é...")
- Você cometer um erro
- Descobrir informação nova importante

Use a ferramenta learn_from_interaction para registrar o aprendizado.
Isso garante que você não repita erros e melhore continuamente.
```

### Handler

```typescript
async function handleLearnFromInteraction(args: any, ctx: SkillContext) {
  const { KnowledgeService } = await import('./knowledge.service');

  await KnowledgeService.save(ctx.tenantId, ctx.agentId, {
    title: `[${args.type.toUpperCase()}] ${args.title}`,
    content: `**Tipo:** ${args.type}\n**Prioridade:** ${args.priority}\n\n${args.details}\n\n_Aprendido automaticamente em ${new Date().toLocaleDateString('pt-BR')}_`,
  });

  return `Aprendizado registrado: "${args.title}". Isso será considerado em futuras conversas.`;
}
```

---

## 4. Skill: DuckDuckGo Search (Grátis, sem API key)

### Tool definition

```typescript
{
  name: 'duckduckgo_search',
  description: 'Busca na web usando DuckDuckGo (gratuito, sem API key)',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Termo de busca' },
      type: { type: 'string', enum: ['text', 'news', 'images'], default: 'text' },
      region: { type: 'string', default: 'br-pt' },
      max_results: { type: 'number', default: 5 },
    },
    required: ['query'],
  },
}
```

### Handler

```typescript
async function handleDuckDuckGoSearch(args: any) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url);
  const data = await res.json();

  const results = [];
  if (data.AbstractText) results.push({ title: data.Heading, snippet: data.AbstractText, url: data.AbstractURL });
  for (const topic of (data.RelatedTopics || []).slice(0, args.max_results || 5)) {
    if (topic.Text) results.push({ title: topic.Text.slice(0, 80), snippet: topic.Text, url: topic.FirstURL });
  }

  return results.length > 0
    ? JSON.stringify(results.map(r => `${r.title}: ${r.snippet} (${r.url})`))
    : 'Nenhum resultado encontrado.';
}
```

---

## 5. Skill: Google Calendar

### Tool definition

```typescript
{
  name: 'google_calendar',
  description: 'Gerencia eventos do Google Calendar: listar, criar, cancelar',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'delete'] },
      // list
      days_ahead: { type: 'number', description: 'Listar eventos dos próximos N dias', default: 7 },
      // create
      title: { type: 'string' },
      date: { type: 'string', description: 'Data ISO: 2026-03-20T14:00:00' },
      duration_minutes: { type: 'number', default: 60 },
      description: { type: 'string' },
      // delete
      event_id: { type: 'string' },
    },
    required: ['action'],
  },
}
```

---

## 6. Skill: Google Sheets

### Tool definition

```typescript
{
  name: 'google_sheets',
  description: 'Lê e escreve dados em planilhas Google Sheets',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'append'] },
      spreadsheet_id: { type: 'string' },
      range: { type: 'string', description: 'Ex: Sheet1!A1:D10' },
      values: { type: 'array', description: 'Para write/append: array de arrays' },
    },
    required: ['action', 'spreadsheet_id'],
  },
}
```

---

## 7. Skill: Trello

### Tool definition

```typescript
{
  name: 'trello',
  description: 'Gerencia quadros, listas e cartões do Trello',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list_boards', 'list_cards', 'create_card', 'move_card', 'archive_card', 'add_comment'] },
      board_id: { type: 'string' },
      list_id: { type: 'string' },
      card_id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      comment: { type: 'string' },
      target_list_id: { type: 'string' },
    },
    required: ['action'],
  },
}
```

---

## 8. Skill: Email Send (SMTP)

### Tool definition

```typescript
{
  name: 'email_send',
  description: 'Envia email via SMTP',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Email do destinatário' },
      subject: { type: 'string' },
      body: { type: 'string', description: 'Corpo do email (texto ou HTML)' },
      html: { type: 'boolean', default: false },
    },
    required: ['to', 'subject', 'body'],
  },
}
```

---

## 9. UI — Marketplace no Dashboard

### Página "Skills" (nova rota /skills)

```
┌─────────────────────────────────────────────────────┐
│ ⚡ MARKETPLACE DE SKILLS                            │
│ Adicione capacidades aos seus agentes               │
│                                                     │
│ [Todas] [Nativas] [Integrações] [Comunicação]       │
│                                                     │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│ │ 🔍 Busca Web│ │ 🧠 Auto-    │ │ 🦆 DuckDuck │   │
│ │  ATIVA ✅   │ │ Aprendizado │ │  Go Search  │   │
│ │             │ │  ATIVA ✅   │ │  ATIVA ✅   │   │
│ │ [Desativar] │ │ [Desativar] │ │ [Desativar] │   │
│ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                     │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│ │ 📅 Google   │ │ 📊 Google   │ │ 📋 Trello   │   │
│ │  Calendar   │ │  Sheets     │ │             │   │
│ │  INATIVA    │ │  INATIVA    │ │  INATIVA    │   │
│ │ [Ativar]    │ │ [Ativar]    │ │ [Ativar]    │   │
│ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                     │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│ │ 📧 Email    │ │ 💳 Stripe   │ │ 📝 Notion   │   │
│ │  SMTP       │ │             │ │             │   │
│ │  INATIVA    │ │  INATIVA    │ │  INATIVA    │   │
│ │ [Ativar]    │ │ [Ativar]    │ │ [Ativar]    │   │
│ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Modal de ativação (quando clica "Ativar")

```
┌────────────────────────────────────────┐
│ 📅 GOOGLE CALENDAR                     │
│                                        │
│ Permite ao agente gerenciar eventos    │
│ do Google Calendar: listar, criar e    │
│ cancelar compromissos.                 │
│                                        │
│ ── Credenciais Necessárias ──          │
│                                        │
│ Google API Key:                        │
│ [ AIza...                          ]   │
│                                        │
│ Calendar ID (opcional):                │
│ [ primary                          ]   │
│                                        │
│ ── Agentes ──                          │
│ ☑ Thulio                              │
│ ☑ Raphael                             │
│ ☐ Lumi Helper                         │
│                                        │
│ [Cancelar]  [✅ Ativar para Agentes]   │
└────────────────────────────────────────┘
```

---

## 10. Backend — Skill Registry

```typescript
// src/services/skill-registry.ts

import { SKILL_CATALOG } from './skills/catalog';

export class SkillRegistry {

  /** Retorna tools ativas para um agente */
  static async getActiveTools(tenantId: string, agentId: string) {
    const activeSkills = await prisma.agentSkill.findMany({
      where: { tenantId, agentId, enabled: true },
    });

    return activeSkills
      .map(s => SKILL_CATALOG[s.skillId])
      .filter(Boolean)
      .map(skill => skill.tool);
  }

  /** Retorna adições ao system prompt */
  static async getSystemPromptAdditions(tenantId: string, agentId: string) {
    const activeSkills = await prisma.agentSkill.findMany({
      where: { tenantId, agentId, enabled: true },
    });

    return activeSkills
      .map(s => SKILL_CATALOG[s.skillId]?.systemPromptAddition)
      .filter(Boolean)
      .join('\n\n');
  }

  /** Executa handler de uma skill */
  static async executeSkill(skillId: string, args: any, context: SkillContext) {
    const skill = SKILL_CATALOG[skillId];
    if (!skill) throw new Error(`Skill "${skillId}" não encontrada`);
    return skill.handler(args, context);
  }
}
```

---

## 11. Skills Pré-Instaladas por Padrão

Ao criar um novo agente, estas skills já vêm ativas:

| Skill | Motivo |
|-------|--------|
| `knowledge_search` | Essencial — busca na base de conhecimento |
| `write_memory` | Essencial — agente salva informações |
| `call_api` | Diferencial — integra com qualquer API via docs |
| `self_improving` | Diferencial — agente aprende com erros |
| `duckduckgo_search` | Grátis — busca web sem API key |
| `scrape_url` | Útil — extrai conteúdo de URLs |
| `escalate_human` | Segurança — transfere para humano |

> `web_search` (Brave) fica desativado por padrão porque precisa de API key.

---

## 12. Checklist de Implementação

```
[x] SKILL_CATALOG: 12 skills (7 nativas + 5 integrações) ✅ 18/03/2026
[x] SkillRegistry: getActiveTools, getSystemPromptAdditions, execute ✅ 18/03/2026
[x] Refatorar AIService — tools dinâmicas por agente via SkillRegistry ✅ 18/03/2026
[x] Handler: self_improving (learn_from_interaction → Knowledge) ✅ 18/03/2026
[x] Handler: duckduckgo_search (busca grátis sem API key) ✅ 18/03/2026
[x] Handler: google_calendar (Google Calendar API) ✅ 18/03/2026
[x] Handler: google_sheets (Google Sheets API) ✅ 18/03/2026
[x] Handler: trello (Trello REST API) ✅ 18/03/2026
[x] Handler: email_send (Brevo SMTP) ✅ 18/03/2026
[x] Handler: stripe_query (Stripe API) ✅ 18/03/2026
[x] Handler: notion (Notion API) ✅ 18/03/2026
[x] Handler: call_api (HTTP genérico — integra com qualquer API via docs) ✅ 18/03/2026
[x] Aba Skills do agente unificada com marketplace (mesmo catálogo) ✅ 18/03/2026
[x] Toggle skill ativa/desativa instantâneo (sem botão Salvar) ✅ 18/03/2026
[x] Prisma: @@unique([agentId, skillId]) no AgentSkill ✅ 18/03/2026
[x] API: /skills/catalog, /skills/agent/:id/activate, /deactivate, /defaults ✅ 18/03/2026
[x] Frontend: página /skills (marketplace grid + modal ativação) ✅ 18/03/2026
[x] Frontend: botão Skills no card do agente → link para /skills?agentId ✅ 18/03/2026
[x] Menu lateral: link Skills com ícone Sparkles ✅ 18/03/2026
[x] Skill: self_configure — agente atualiza soul, instala skills, salva credenciais ✅ 19/03/2026
```

---

## 13. Custom Skills — APIs Auto-Configuradas (Fase 35)

Quando um agente usa `self_configure(save_credential)`, a API é registrada como **Custom Skill** e aparece na aba "Personalizadas" do Marketplace.

```
Agente instala GeraThumbs:
  self_configure(save_credential, "gerarthumbs_key", "sk-xxx")
    ↓
  Credencial salva no vault
  agentSkill criado: { skillId: "custom:gerarthumbs_key", agent: X }
    ↓
  Aparece em Skills > Personalizadas
```

### UI
- Nova aba "Personalizadas" com contador de APIs
- Card roxo por API, mostrando quais agentes configuraram
- Botão de lixeira para revogar acesso

Veja [Fase 35](./35_Auto_Configuracao_Workflows_SQLite.md#1-skill-auto-configuração-self_configure) para detalhes completos.

---

## 14. Diferencial: Integração com Qualquer API via Docs

A skill `call_api` permite que o agente se integre com **qualquer serviço externo** sem código e sem plugins específicos. O fluxo é:

```
1. Usuário cola documentação da API no Knowledge do agente
   (endpoint, headers, body, exemplos)

2. Agente salva na memória via write_memory

3. Quando precisa usar, busca via knowledge_search

4. Monta e executa a requisição via call_api

5. Retorna resultado ao usuário
```

### Exemplo: API do GeraThumbs

O usuário cola no Knowledge:
```
API GeraThumbs - https://api.gerarthumbs.com/v1
POST /generate — Gera thumbnail
Headers: Authorization: Bearer {API_KEY}
Body: { "title": "texto", "template": "youtube" }
Response: { "url": "https://cdn.gerarthumbs.com/xxx.png" }
```

Depois no chat:
```
Usuário: "Cria uma thumb com título 'Como ganhar dinheiro em 2026'"

Agente:
1. knowledge_search("gerarthumbs api") → encontra docs
2. call_api(POST, "https://api.gerarthumbs.com/v1/generate",
   headers: { Authorization: "Bearer xxx" },
   body: { title: "Como ganhar dinheiro em 2026", template: "youtube" })
3. Retorna: "Thumbnail criada: https://cdn.gerarthumbs.com/xxx.png"
```

### Segurança
- Bloqueia chamadas para localhost/IPs internos
- Timeout de 15s por requisição
- System prompt pede confirmação antes de POST/PUT/DELETE
- Resposta limitada a 4000 caracteres

### Funciona com qualquer API
- Stripe, Shopify, Mercado Livre, HubSpot, Notion
- APIs internas da empresa do cliente
- Webhooks (Zapier, Make, N8N)
- Qualquer REST API documentada
```
