# Fase 25 — Refinamento da Arquitetura: CronJob, Canais por Agente & UX

Versão: 1.0

---

## A Visão

Corrigir inconsistências de lógica no sistema, adicionar funcionalidades essenciais que estão faltando e alinhar todas as páginas com a arquitetura real do produto: **cada agente é uma entidade independente com suas próprias contas, canais e agendamentos**.

```
┌─────────────────────────────────────────────────────────────┐
│  AGENTE = unidade autônoma                                   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ WhatsApp │  │ Telegram │  │ Web Chat │  │  CronJob    │ │
│  │ (própria │  │ (próprio │  │ (sempre  │  │ (dispara    │ │
│  │  conta)  │  │  bot)    │  │  ativo)  │  │  sozinho)   │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ SOUL.md  │  │ Skills   │  │ Knowledge│                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. CronJob para Agentes (Agendamento Automático)

### Conceito
O agente pode ser configurado para **disparar automaticamente** em horários definidos pelo usuário. Ele executa uma tarefa pré-definida (prompt) sem intervenção humana.

### Exemplos de uso
- Agente de marketing publica post todo dia às 9h
- Agente de monitoramento verifica preços a cada 2h
- Squad de relatório gera resumo semanal toda segunda às 8h

### Schema Prisma
```prisma
model AgentCron {
  id        String   @id @default(uuid())
  agentId   String   @map("agent_id")
  tenantId  String   @map("tenant_id")
  name      String   // "Postar conteúdo diário"
  prompt    String   // "Pesquise tendências e crie um post para Instagram"
  schedule  String   // Cron expression: "0 9 * * *" (todo dia às 9h)
  timezone  String   @default("America/Sao_Paulo")
  enabled   Boolean  @default(true)
  lastRunAt DateTime? @map("last_run_at")
  nextRunAt DateTime? @map("next_run_at")
  lastResult String? @map("last_result") // "success" | "error"
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  agent Agent @relation(fields: [agentId], references: [id])

  @@map("agent_crons")
}
```

### Endpoints
```
GET    /v1/agents/:agentId/crons          — lista crons do agente
POST   /v1/agents/:agentId/crons          — cria novo cron
PATCH  /v1/agents/:agentId/crons/:id      — edita (prompt, schedule, enabled)
DELETE /v1/agents/:agentId/crons/:id      — remove cron
POST   /v1/agents/:agentId/crons/:id/run  — dispara manualmente (testar)
```

### Motor de execução
```typescript
// CronService — usa node-cron ou BullMQ repeatable jobs
import cron from 'node-cron';

class CronService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  async loadAll() {
    const crons = await prisma.agentCron.findMany({ where: { enabled: true } });
    for (const c of crons) {
      this.schedule(c);
    }
  }

  schedule(cronJob: AgentCron) {
    const task = cron.schedule(cronJob.schedule, async () => {
      await aiService.chat({
        agentId: cronJob.agentId,
        tenantId: cronJob.tenantId,
        message: cronJob.prompt,
        source: 'cron',
      });
      await prisma.agentCron.update({
        where: { id: cronJob.id },
        data: { lastRunAt: new Date(), lastResult: 'success' }
      });
    }, { timezone: cronJob.timezone });

    this.jobs.set(cronJob.id, task);
  }
}
```

### Frontend — Onde aparece
- **Página do Agente** → aba "Agendamentos" ou seção dentro do card expandido
- **Workflows** → nó "CronTrigger" no canvas que dispara a squad em horário

### UI do CronJob
```
┌─────────────────────────────────────────────┐
│  ⏰ Agendamentos do Agente                  │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ 📋 Postar conteúdo diário              │ │
│  │ Cron: 0 9 * * *  (Todo dia às 09:00)   │ │
│  │ Status: ✅ Ativo                        │ │
│  │ Última: 17/03 09:00 — sucesso           │ │
│  │ [Editar] [Desativar] [Rodar agora]      │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  [+ Novo Agendamento]                        │
└─────────────────────────────────────────────┘
```

---

## 2. Canais por Agente (1 agente = 1 conta)

### Problema atual
- Chaves WhatsApp/Telegram estão na página **Configurações** (global, uma só pra todo workspace)
- Não faz sentido: se tenho 5 agentes, cada um deveria ter seu próprio número WhatsApp e bot Telegram

### Nova lógica
- **Cada agente** configura seus canais individualmente
- Token WhatsApp → dentro do agente, não global
- Bot Telegram → cada agente tem seu @bot_token
- Tabela `AgentApiKey` já existe e suporta isso (agentId + type)

### Fluxo correto
```
Página Canais → mostra grid de agentes
  → Clica no agente → abre modal de configuração do canal
    → WhatsApp: cola o token Meta daquele número específico
    → Telegram: cola o bot token do @BotFather
    → Salva em AgentApiKey (agentId + type + token criptografado)
    → Backend inicia listener daquele canal para aquele agente
```

### O que muda na página Configurações
Remover seção "Canais Sociais & Meta" — fica apenas:
```
┌─────────────────────────────────────────────┐
│  ⚙️ Configurações do Workspace              │
│                                              │
│  🤖 Provedores de IA                        │
│  ├── OpenRouter Key                          │
│  └── Groq Key (Whisper)                      │
│                                              │
│  🔍 Ferramentas & Busca                     │
│  ├── Brave Search Key                        │
│  └── Brevo Key (Email)                       │
│                                              │
│  🎨 Aparência                               │
│  └── Tema (salvo no banco) ✅ já feito       │
└─────────────────────────────────────────────┘
```

### O que muda na página Canais
```
┌─────────────────────────────────────────────────────┐
│  📡 Canais — Cada agente, sua própria conta         │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  🤖 Agente: Lumi Vendas                      │   │
│  │                                               │   │
│  │  WhatsApp  │ +55 11 9999-1234 │ ✅ Conectado  │   │
│  │  Telegram  │ @lumi_vendas_bot │ ✅ Conectado  │   │
│  │  Web Chat  │ Sempre ativo     │ ✅ Pronto     │   │
│  │                                               │   │
│  │  [Configurar WhatsApp] [Configurar Telegram]  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  🤖 Agente: Lumi Suporte                     │   │
│  │                                               │   │
│  │  WhatsApp  │ Não configurado  │ ⚪ Pendente   │   │
│  │  Telegram  │ @lumi_suporte    │ ✅ Conectado  │   │
│  │  Web Chat  │ Sempre ativo     │ ✅ Pronto     │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### ConnectorModal (precisa funcionar)
```
┌──────────────────────────────────────────┐
│  Configurar WhatsApp — Lumi Vendas       │
│                                           │
│  Método: Meta Cloud API                  │
│                                           │
│  Token de acesso permanente:             │
│  ┌──────────────────────────────────┐    │
│  │ EAAxxxxxxxxxxxxxxxx...          │    │
│  └──────────────────────────────────┘    │
│                                           │
│  Phone Number ID:                        │
│  ┌──────────────────────────────────┐    │
│  │ 1234567890                      │    │
│  └──────────────────────────────────┘    │
│                                           │
│  [Testar Conexão]  [Salvar e Conectar]   │
└──────────────────────────────────────────┘
```

---

## 3. Remover WhatsApp/Meta do Config Global

### Antes (errado)
```
Configurações → Canais Sociais & Meta
  → meta_app_secret
  → whatsapp_token
```

### Depois (correto)
- `meta_app_secret` → remove (ou move para configuração avançada se for webhook global)
- `whatsapp_token` → remove (agora é por agente na página Canais)
- Manter apenas chaves que são **globais do workspace**: openrouter, groq, brave, brevo

---

## 4. Aba Squads no Conhecimento

### Conceito
Na página de Conhecimento, além das abas "Conhecimento", "Soul" e "Skills", adicionar uma aba **"Squads"** que mostra:
- Squads do agente selecionado (onde ele é líder ou funcionário)
- Funcionários de cada squad com seus SOULs e skills
- Memórias aprendidas pela squad

### Layout
```
┌─────────────────────────────────────────────────────┐
│  📚 Conhecimento do Agente: Lumi Estrategista       │
│                                                      │
│  [Conhecimento] [Soul] [Skills] [Squads]            │
│                                                      │
│  ── Aba Squads ──────────────────────────────────── │
│                                                      │
│  Squad: Time de Marketing Digital                    │
│  Papel: 👑 Líder                                    │
│                                                      │
│  Funcionários:                                       │
│  ┌────────────────────────────────────────────┐     │
│  │ 🔍 Pesquisador                             │     │
│  │ Skills: web_search, scrape_url             │     │
│  │ Soul: "Analítico, busca 3+ fontes"         │     │
│  │ [Ver Soul] [Editar Skills]                 │     │
│  ├────────────────────────────────────────────┤     │
│  │ ✍️ Criador de Post                         │     │
│  │ Skills: write_memory, knowledge_search     │     │
│  │ Soul: "Criativo, tom profissional"         │     │
│  │ [Ver Soul] [Editar Skills]                 │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  Memórias da Squad (3):                              │
│  • "Posts com emojis têm 40% mais engajamento"       │
│  • "Evitar linguagem muito técnica no Instagram"     │
│  • "Fonte preferida: dados do Statista"              │
└─────────────────────────────────────────────────────┘
```

---

## 5. Barra de Atalhos `/` no Chat Web

### Conceito
Quando o usuário digita `/` no campo de mensagem, aparece um menu autocomplete com comandos disponíveis.

### Comandos disponíveis
```
/agente [nome]     → troca o agente ativo no chat
/squad usar [nome] → ativa uma squad (já existe)
/squad lista       → lista squads disponíveis (já existe)
/squad status      → mostra status da squad ativa (já existe)
/squad memoria     → mostra memórias da squad (já existe)
/squad reset       → desativa squad do chat (já existe)
/memoria           → mostra fragmentos de conhecimento do agente
/soul              → mostra o SOUL.md do agente
/crons             → lista agendamentos do agente
/limpar            → limpa histórico do chat
/ajuda             → lista todos os comandos
```

### UI
```
┌─────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────┐    │
│  │ /ag                                     │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │ 🤖 /agente [nome]  Trocar agente       │ ◀──│
│  │ 🧠 /ajuda          Lista de comandos   │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## 6. Paginação e Filtros nos Logs

### Atual
- Carrega todas as interações de uma vez
- Campo de busca existe mas não funciona
- Sem filtro por agente, período ou status

### Novo
```
GET /v1/analytics/interactions?page=1&limit=50&agentId=xxx&from=2026-03-01&to=2026-03-17&status=success
```

### UI
```
┌─────────────────────────────────────────────────────┐
│  🔍 Filtros:                                         │
│  Agente: [Todos ▼]  Status: [Todos ▼]  Período: [7d]│
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ # │ Agente    │ Modelo │ Tokens │ Custo │ Data  │ │
│  │ 1 │ Lumi V.   │ GPT-4o │ 1.2k   │ $0.03 │ 17/03│ │
│  │ 2 │ Lumi S.   │ Gemini │ 800    │ $0.01 │ 17/03│ │
│  │...│           │        │        │       │       │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ← 1 2 3 ... 12 →                      50 por página│
└─────────────────────────────────────────────────────┘
```

---

## 7. Checklist de Implementação

### Backend
```
[x] Model AgentCron no Prisma + migration ✅ 17/03/2026
[x] CronService — carrega, agenda, executa, para ✅ 17/03/2026
[x] CRUD endpoints /v1/crons/:agentId (GET, POST, PATCH, DELETE, POST /run) ✅ 17/03/2026
[x] POST /crons/:agentId/:id/run — disparo manual ✅ 17/03/2026
[x] Iniciar CronService no boot do servidor (já existia, corrigido) ✅ 17/03/2026
[x] Remover whatsapp_token e meta_app_secret da página Config ✅ 17/03/2026
[x] Completar GET /channels/:agentId — lista canais reais do AgentApiKey ✅ 17/03/2026
[x] Endpoint DELETE /channels/:agentId/:type — desconectar canal ✅ 17/03/2026
[ ] Endpoint POST /channels/:agentId/:type/test — testar conexão
[ ] GET /analytics/interactions com paginação + filtros (agentId, status, período)
[x] Human Approval real — pausar workflow + notificar via Telegram/WhatsApp ✅ 18/03/2026
[x] Handler /aprovar e /rejeitar nos bots (Telegram + WhatsApp) ✅ 18/03/2026
[x] Endpoint POST /approvals/:id/approve, reject e GET pending ✅ 18/03/2026
[x] Timeout automático para aprovações expiradas (24h, CronService) ✅ 18/03/2026
```

### Frontend
```
[x] Seção "Agendamentos (CronJob)" no modal de edição do agente ✅ 17/03/2026
[ ] Nó CronTrigger no canvas de workflows
[x] ConnectorModal funcional (WhatsApp QR + Telegram bot token) — já existia ✅ 17/03/2026
[x] Remover seção "Canais Sociais & Meta" da página Config ✅ 17/03/2026
[x] Página Canais refatorada — grid por agente com status real do banco ✅ 17/03/2026
[x] Aba "Squads" na página Conhecimento — membros, skills, memórias ✅ 18/03/2026
[x] Barra de atalhos / no Chat Web — autocomplete com setas + Tab ✅ 18/03/2026
[x] Drag-and-drop de arquivos .md no painel do funcionário (SOUL + Conhecimento + Persona) ✅ 18/03/2026
[x] HumanApprovalNode com collapse persistente ✅ 18/03/2026
[x] AgentNode collapsed salvo em data (persiste no auto-save) ✅ 18/03/2026
[x] CORS — PATCH adicionado aos métodos permitidos ✅ 18/03/2026
[x] Fix PATCH /dashboard/agents/:id — campos filtrados + findFirst ✅ 18/03/2026
[x] Líder cria AgentNode automaticamente dentro da squad ✅ 18/03/2026
[x] Handles laterais (Left/Right) nos AgentNodes dentro da squad ✅ 18/03/2026
[x] isValidConnection — permite conexões entre nós dentro da mesma squad ✅ 18/03/2026
[x] Paginação + filtros na página Logs (agente, status, 30/página) ✅ 18/03/2026
[x] Campo de busca funcional nos Logs (ID, agente, modelo, conteúdo) ✅ 18/03/2026
[x] Backend GET /analytics/interactions com paginação + count total ✅ 18/03/2026
[x] Remoção da status bar branca do canvas de workflows ✅ 18/03/2026
[x] Remoção do botão Gatilho da toolbar (redundante) ✅ 18/03/2026
[x] Remoção do botão Executar da toolbar (já tem no header) ✅ 18/03/2026
[x] HumanApprovalNode traduzido para português ✅ 18/03/2026
[x] Histórico de conversas unificado — sidebar com web+wa+tg ✅ 18/03/2026
[x] Botão "Nova Conversa" e "Histórico" no header do chat ✅ 18/03/2026
[x] Endpoints GET/POST /ai/conversations — lista, cria, carrega mensagens ✅ 18/03/2026
[x] POST /ai/chat persiste mensagens no banco (conversationId) ✅ 18/03/2026
[x] Prisma Singleton — 25 instâncias → 1 (fix "TOO MANY CONNECTIONS") ✅ 18/03/2026
[x] Config simplificado — dropdown provedor + modelo + 1 campo de chave ✅ 18/03/2026
[x] Removido card "Aprovação Humana" do Config (usa canal do agente) ✅ 18/03/2026
[x] Microfone no Chat Web — grava áudio + transcreve via Groq Whisper ✅ 18/03/2026
[x] Endpoint POST /ai/transcribe — recebe base64, envia Groq, retorna texto ✅ 18/03/2026
[x] Waveform animada durante gravação (9 barras + timer) ✅ 18/03/2026
[x] Chat carrega última conversa automaticamente ao abrir ✅ 18/03/2026
[x] Gráfico dashboard — barras com altura mínima visível (20px) ✅ 18/03/2026
[x] Timeout 30s no fetch do AIService + mensagens claras de erro ✅ 18/03/2026
[x] Fix Telegram connect — para instância antes de reconectar ✅ 18/03/2026
```

---

## 8. Human Approval Real (Notificação via Telegram/WhatsApp)

### Conceito
Quando o workflow chega no nó "Aprovação Humana", o sistema **pausa a execução** e envia uma notificação para o aprovador via Telegram ou WhatsApp do agente. O aprovador responde no próprio canal e o workflow retoma automaticamente.

### Fluxo Completo
```
1. Squad executa → chega no nó "Human Approval"
2. WorkflowRunner pausa o run (status: "waiting_approval")
3. Sistema identifica o canal do aprovador (Telegram ou WhatsApp)
4. Bot do agente envia mensagem:

   🔔 Aprovação Necessária
   Squad: "Time de Marketing"
   Etapa: "Revisão do Post"
   Resultado parcial: [resumo do que foi gerado]

   Responda:
   /aprovar_abc123 — continuar execução
   /rejeitar_abc123 — cancelar

5. Aprovador responde /aprovar no Telegram (ou botão inline)
6. Backend recebe → busca HumanApproval pendente por runId
7. Atualiza status → "approved"
8. WorkflowRunner retoma de onde parou
9. Squad continua executando os próximos nós
```

### Endpoints
```
POST /v1/approvals/:id/approve — aprovar (chamado pelo bot ou frontend)
POST /v1/approvals/:id/reject  — rejeitar
GET  /v1/approvals/pending      — lista aprovações pendentes do tenant
```

### Bot Handler (Telegram)
```typescript
// Quando o bot recebe /aprovar_abc123
bot.onText(/\/aprovar_(.+)/, async (msg, match) => {
  const approvalId = match[1];
  await api.post(`/approvals/${approvalId}/approve`);
  bot.sendMessage(msg.chat.id, '✅ Aprovado! O workflow vai continuar.');
});
```

### Bot Handler (WhatsApp)
```typescript
// Mensagem interativa com botões
{
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: '🔔 Aprovação necessária...' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'aprovar_abc123', title: '✅ Aprovar' } },
        { type: 'reply', reply: { id: 'rejeitar_abc123', title: '❌ Rejeitar' } }
      ]
    }
  }
}
```

### Timeout
- Configurável no nó: 1h, 6h, 12h, 24h, 48h
- Se não responder no prazo → rejeita automaticamente
- CronService verifica aprovações expiradas a cada 5 minutos

### Checklist
```
[ ] WorkflowRunner: pausar run ao chegar no nó approval
[ ] Enviar notificação via bot Telegram do agente
[x] Enviar notificação via WhatsApp do agente ✅ 18/03/2026
[x] Handler /aprovar_XXXX e /rejeitar_XXXX no bot Telegram ✅ 18/03/2026
[x] Handler /aprovar e /rejeitar no bot WhatsApp ✅ 18/03/2026
[x] Endpoint POST /approvals/:id/approve e reject ✅ 18/03/2026
[x] GET /workflows/approvals/pending — lista aprovações pendentes ✅ 18/03/2026
[x] Timeout automático 24h (CronService verifica a cada 5min) ✅ 18/03/2026
[ ] Campo timeout configurável no nó HumanApproval (futuro)
[ ] Frontend: mostrar aprovações pendentes no dashboard
```

---

## 9. Prioridade de Execução

| Ordem | Item | Justificativa |
|-------|------|---------------|
| 1 | CronJob para agentes | Feature diferenciador — agentes autônomos |
| 2 | Canal por agente | Corrige lógica errada — essencial para SaaS |
| 3 | Remover WA/Meta do Config | Limpa confusão — rápido de fazer |
| 4 | Aba Squads no Conhecimento | Completa a experiência de gestão de squads |
| 5 | Barra de atalhos / no Chat | Melhora UX — produtividade do usuário |
| 6 | Paginação nos Logs | Performance — evita travamento com muitos dados |
