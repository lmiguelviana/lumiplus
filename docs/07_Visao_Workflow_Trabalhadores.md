# Visão do Workflow de Squads — Agentes, Trabalhadores e Memória

**Versão:** 1.1  
**Objetivo:** A tela **Workflow de Squads** (antes referida como “Mindmaster”) é o único builder de fluxos do Lumi Plus: uso de agentes já criados, trabalhadores com contexto/soul individual, notificação ao humano e memória/aprendizado.

---

## 1. Princípio central

No **Workflow** o usuário **não cria agentes do zero**. Ele:

1. **Usa os agentes já feitos** (cadastrados em Agentes no dashboard).
2. **Adiciona trabalhadores** ao fluxo — cada trabalhador é uma **instância** de um agente, com **contexto e soul individuais** para aquela tarefa.
3. Esses trabalhadores executam as tarefas solicitadas pelo agente (ou pelo líder do squad).
4. Quando precisar, o sistema **manda mensagem para o humano** no Telegram ou WhatsApp (canais já configurados).

---

## 2. Fluxo no canvas (Workflow)

```
┌─────────────────────────────────────────────────────────────────┐
│  WORKFLOW (Canvas)                                               │
│                                                                  │
│  [TRIGGER] ──► [AGENTE/LÍDER] ──► [TRABALHADOR 1] ──► ...       │
│                     │                    │                       │
│                     │                    └── Escritor (soul+ctx) │
│                     │                    └── Design (soul+ctx)   │
│                     │                    └── Analista (soul+ctx) │
│                     │                                            │
│                     └──► [HUMAN APPROVAL] ──► Telegram / WhatsApp │
└─────────────────────────────────────────────────────────────────┘
```

- **Trigger:** evento que inicia o fluxo (manual, webhook, cron, etc.).
- **Agente/Líder:** agente já existente que recebe o objetivo e orquestra.
- **Trabalhadores:** nós do tipo "FUNCIONÁRIO IA" no canvas — cada um é um **agente base** (já criado) + **identidade squad** (nome, soul, skin, mandato específico).
- **Human Approval:** quando o fluxo precisa de ok humano, notifica no **Telegram** e/ou **WhatsApp** (conforme configurado no nó).

---

## 3. Trabalhadores = Agentes existentes + contexto individual

Cada nó **Trabalhador** no workflow:

| Campo | Descrição |
|-------|-----------|
| **Inteligência base** | Agente já cadastrado (ex.: Sofia, Copywriter, Design Bot). Seleção no dropdown. |
| **Identidade Squad (nome)** | Nome dessa instância no fluxo (ex.: "Copywriter Sênior", "Design Revisor"). |
| **Soul (Alma)** | Temperamento/instrução momentânea (texto livre ou MD). |
| **Skin (Comportamento)** | Persona/estética dessa instância. |
| **Função / Mandato** | O que este trabalhador deve fazer **neste passo** do fluxo (texto em Markdown). |

Assim, o **mesmo agente** pode aparecer em vários nós com **soul e mandato diferentes** em cada um.

- **Implementação atual:** o `AgentNode` no `flow-builder.tsx` já tem: seleção de agente (`agentId`), label, soul, skin e prompt/mandato. O worker usa `node.data?.agentId` e `node.data?.prompt` (ou `node.prompt`) na execução.

---

## 4. Notificação ao humano (Telegram / WhatsApp)

Quando o fluxo passa por um nó **Human Approval**:

- O run **pausa** com status `waiting_approval`.
- O humano pode ser notificado por **Telegram** e/ou **WhatsApp** conforme os botões configurados no nó (`notifyTelegram`, `notifyWhatsApp`).
- Ao **aprovar**, o fluxo segue (chamada a `POST /v1/workflows/runs/:runId/resume`).

Requisito: os canais (Telegram, WhatsApp) já devem estar configurados no tenant para que a notificação seja enviada. O backend já possui `TelegramService` e `WhatsAppService`; falta conectar o evento "workflow pausado para aprovação" ao envio da mensagem para o contacto do dono/operador.

---

## 5. Sub-agentes (escritor, design, etc.) com memória e aprendizado

Sub-agentes (escritor, design, analista, etc.) são **agentes já criados** usados como trabalhadores no fluxo. Eles podem:

### 5.1 Memória de arquivos (.md e outros)

- **Base de conhecimento (RAG):** cada agente pode ter documentos em **Markdown**, PDF, TXT, DOCX associados via **Conhecimento** (Knowledge).
- O `KnowledgeService` faz chunking e, com PostgreSQL + pgvector, busca semântica para injetar contexto na resposta do agente.
- No workflow, ao executar um nó de agente/trabalhador, o runner pode (e deve) usar o `agentId` para buscar contexto em `KnowledgeService.search(tenantId, agentId, query)` e injetar no prompt.

### 5.2 Aprendizado (ficando mais inteligentes)

- **Interações registradas:** `AgentInteraction` guarda input, output, modelo, tokens, latência. Isso gera histórico por agente.
- **Memória de longo prazo:** `AgentMemory` (por contacto) e conhecimento (RAG) aumentam o contexto disponível ao longo do tempo.
- Para "aprender padrões" e ficar mais inteligentes, o sistema pode:
  - **Curto prazo:** usar sempre o RAG atualizado (novos .md e conteúdos escritos no conhecimento).
  - **Médio/longo prazo (evolução):** usar o histórico de interações para resumir boas práticas, ou para ajustar instruções (ex.: recomendações no system prompt baseado em feedback). Isso pode ser uma feature futura (ex.: "padrões aprendidos" por agente).

Hoje o que está pronto: **memória via Knowledge (arquivos .md e escritos)** e **histórico de interações**. O "aprendizado de padrões" pode ser documentado como roadmap (resumos automáticos, feedback positivo/negativo, etc.).

---

## 6. Resumo do que o sistema já faz vs. o que falta

| Aspecto | Status | Onde |
|---------|--------|------|
| Usar agentes já criados no workflow | ✅ | `AgentNode` com select de agentes (`/dashboard/agents`), `node.agentId` no worker |
| Trabalhadores com soul/contexto individual | ✅ | Soul, Skin, Mandato por nó no `AgentNode` |
| Notificação Telegram/WhatsApp no Human Approval | ⚠️ | UI tem botões; falta enviar mensagem ao pausar (integrar com Telegram/WhatsApp) |
| Memória (arquivos .md, conhecimento) por agente | ✅ | `KnowledgeService` + `AgentKnowledge`; falta injetar RAG no runner do workflow |
| Aprendizado (padrões, ficar mais inteligente) | 🔜 | Histórico existe; "padrões aprendidos" pode ser evolução futura |
| Persistência do canvas em Squad/Workflow no banco | ✅ | `docs/fase_atual/20_Squad_Builder_Correcao.md` — CRUD completo. |
| Execução autônoma via Chat (Skills) | ✅ | Skills `run_squad` e `run_workflow` em `catalog.ts`. |

---

## 7. Referência à pasta `.agent/agents`

A pasta **`.agent/agents`** contém definições de agentes (orchestrator, product-owner, project-planner) usados no ecossistema de desenvolvimento (Cursor/Codex) para **organizar e executar tarefas de implementação**. Eles **não** são os agentes de runtime do Lumi Plus (Sofia, Copywriter, etc.), mas servem de **inspiração** para:

- **Orquestração:** quem coordena e quem executa (líder vs. trabalhadores).
- **Papéis:** product-owner (requisitos), project-planner (planejamento), orchestrator (coordenação).
- **Skills:** uso de skills por tipo de agente (ver `.agent/skills`).

No Lumi Plus, o equivalente runtime é: **agentes cadastrados** = “tipos” (escritor, design, analista); **trabalhadores no canvas** = instâncias com soul/mandato específico; **Skills** = AgentSkill no banco (busca web, APIs, etc.). A organização do produto e do código pode seguir a mesma lógica de papéis e skills descrita em `.agent/agents` e `.agent/skills`.

---

## 8. Checklist de implementação (prioridades)

- [x] **Workflow runner:** ao processar nó tipo `agent`, chamar `KnowledgeService.search(tenantId, agentId, query)` e injetar contexto RAG no prompt.
- [x] **Human Approval:** ao pausar run em `waiting_approval`, se `notifyTelegram`/`notifyWhatsapp` estiverem ativos, enviar mensagem (workspace: `approval_telegram_chat_id`, `approval_whatsapp_jid`).
- [x] **Canvas real:** GET/PUT `/workflows/:id`; FlowBuilder com `workflow`, `onSaveDefinition`, `onRun`; botão "Disparar Agora" chama `POST /workflows/:id/run`.
- [x] **Autonomia via Chat:** implementar skills `run_squad` e `run_workflow` para que o agente acione automações e equipes via mensagem natural.
- [ ] **Documentar** evolução de "aprendizado" (uso de interações para melhorar respostas ou sugerir ajustes de prompt).

---

*Documento alinhado ao PRD v3.5, Agent Spec, 17_Workflows_Squads e 20_Squad_Builder_Correcao.*
