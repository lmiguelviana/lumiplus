# Fase 34: Features Novas — Templates, Analytics, Export, Webhook, Notificações
Versão: 1.0 | PRIORIDADE MÉDIA

---

## Visão

Features que agregam valor ao produto sem mudar a arquitetura. Focam em UX e integrações.

---

## 1. Templates de Agente

Criar agente a partir de templates pré-configurados.

### Templates disponíveis

| Template | Mission | Skills | Modelo |
|----------|---------|--------|--------|
| Atendimento ao Cliente | Responder dúvidas e resolver problemas | knowledge_search, escalate_human, inline_buttons | gemini-2.0-flash |
| Marketing Digital | Criar conteúdo e estratégias | duckduckgo_search, write_memory, call_api | gpt-4o-mini |
| Vendas & CRM | Qualificar leads e agendar reuniões | call_api, google_calendar, inline_buttons | gemini-2.0-flash |
| Suporte Técnico | Troubleshooting e documentação | knowledge_search, scrape_url, write_memory | deepseek-chat |
| Assistente Pessoal | Agenda, emails, tarefas | google_calendar, email_send, write_memory | gpt-4o-mini |
| Pesquisador | Buscar e sintetizar informações | duckduckgo_search, scrape_url, write_memory | gemini-2.0-flash |

### UI
- Botão "Criar do Template" na página de Agentes
- Modal com grid de templates (ícone + nome + descrição)
- Clica → cria agente com config pré-preenchida

### Checklist
```
[ ] Definir 6 templates no backend (JSON)
[ ] Endpoint GET /dashboard/agent-templates
[ ] UI: botão "Criar do Template" + modal grid
[ ] Ao criar: aplica name, mission, systemPrompt, skills, model
```

---

## 2. Analytics por Agente

Gráficos individuais na página de edição do agente.

### Métricas
- Interações por dia (últimos 7d)
- Tokens consumidos
- Latência média
- Satisfação (% 👍 vs 👎)
- Skills mais usadas

### UI
- Nova seção no modal de edição do agente
- Mini gráfico SVG (barras, como o dashboard)
- Cards: interações, tokens, latência, satisfação

### Checklist
```
[ ] Endpoint GET /analytics/agent/:agentId (stats + timeseries)
[ ] UI: seção "Analytics" no modal de edição
[ ] Mini gráficos SVG por agente
```

---

## 3. Export/Import de Agente

Exportar agente como JSON e importar em outro workspace.

### Formato de Export
```json
{
  "version": "2.0",
  "agent": {
    "name": "Thulio",
    "mission": "...",
    "systemPrompt": "...",
    "tone": "...",
    "personality": "...",
    "primaryModel": "...",
    "economyMode": false
  },
  "skills": ["knowledge_search", "duckduckgo_search", "call_api"],
  "knowledge": [
    { "title": "...", "content": "..." }
  ],
  "cronJobs": [
    { "name": "...", "schedule": "...", "prompt": "..." }
  ]
}
```

### Checklist
```
[ ] Endpoint GET /dashboard/agents/:id/export → JSON
[ ] Endpoint POST /dashboard/agents/import → cria agente + skills + knowledge
[ ] UI: botão "Exportar" no card do agente
[ ] UI: botão "Importar Agente" na lista de agentes
```

---

## 4. Webhook Trigger

URL pública que dispara agente ou workflow externamente.

### Endpoint
```
POST /v1/webhooks/:webhookId
Body: { "message": "...", "data": {...} }
```

### Uso
- Zapier, Make, N8N mandam dados → agente processa
- Formulário do site → agente responde
- API externa → dispara workflow

### Schema
```prisma
model Webhook {
  id        String @id @default(uuid())
  tenantId  String
  agentId   String?
  workflowId String?
  secret    String   // Validação HMAC
  enabled   Boolean @default(true)
  createdAt DateTime @default(now())
}
```

### Checklist
```
[ ] Model Webhook no Prisma
[ ] Endpoint POST /webhooks/:id (público, sem auth JWT — valida por secret)
[ ] UI: gerar webhook na página do agente/workflow
[ ] Copiar URL + secret
```

---

## 5. Notificações no Dashboard

Badge de notificações no menu lateral.

### Tipos
- Pedidos de acesso pendentes (Fase 29)
- Workflows com erro
- Aprovações pendentes (Fase 19)
- Canais desconectados

### UI
- Ícone de sino no menu lateral com badge numérico
- Dropdown com lista de notificações
- Clicar → navega para a página relevante

### Checklist
```
[ ] Endpoint GET /dashboard/notifications (agrega pendências)
[ ] UI: ícone sino no Sidebar com badge
[ ] Dropdown com lista de notificações
[ ] Link direto para ação
```

---

## 6. Logs em Tempo Real

WebSocket na página de Logs — ver interações aparecendo ao vivo.

### Implementação
- Reusar workflowEvents (EventEmitter)
- Emitir evento 'new_interaction' ao salvar log
- Frontend: useEffect com WebSocket
- Nova interação aparece no topo da lista com animação

### Checklist
```
[ ] Emitir evento 'new_interaction' no AIService após logInteraction
[ ] WebSocket endpoint em /logs/ws
[ ] Frontend: conectar WS na página Logs
[ ] Animação de nova entrada (fade-in)
```

---

## 7. Rate Limiting por Agente

Limite de mensagens/hora por agente.

### Config
```prisma
model Agent {
  rateLimitPerHour  Int @default(0) // 0 = sem limite
}
```

### Lógica
```typescript
const count = await prisma.agentInteraction.count({
  where: {
    agentId,
    createdAt: { gte: new Date(Date.now() - 3600000) }
  }
});
if (agent.rateLimitPerHour > 0 && count >= agent.rateLimitPerHour) {
  return 'Limite de mensagens atingido. Tente novamente em breve.';
}
```

### Checklist
```
[ ] Campo rateLimitPerHour no Agent (Prisma)
[ ] Verificação no AIService antes de complete()
[ ] UI: campo no modal de edição do agente
[ ] Mensagem amigável ao atingir limite
```

---

## 8. Prioridade de Execução

| Ordem | Feature | Esforço | Impacto |
|-------|---------|---------|---------|
| 1 | Templates de Agente | Baixo | Alto — onboarding rápido |
| 2 | Export/Import | Baixo | Médio — portabilidade |
| 3 | Notificações | Baixo | Médio — UX |
| 4 | Rate Limiting | Baixo | Médio — proteção |
| 5 | Analytics por Agente | Médio | Médio — visibilidade |
| 6 | Webhook Trigger | Médio | Alto — integrações |
| 7 | Logs em Tempo Real | Baixo | Baixo — nice to have |
