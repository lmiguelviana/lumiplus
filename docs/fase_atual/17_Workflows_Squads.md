# Fase 17: Workflow de Squads 🚀

> **Visão de produto:** Ver [07_Visao_Workflow_Trabalhadores.md](../07_Visao_Workflow_Trabalhadores.md) — uso de agentes já criados, trabalhadores com soul/contexto individual, notificação ao humano (Telegram/WhatsApp) e memória/aprendizado.

O objetivo desta fase é o **Workflow de Squads**: uma única tela onde o usuário constrói fluxos usando agentes já criados como trabalhadores, com squads quando precisar. Interface de nós (canvas) para orquestrar agentes e aprovações.

## Proposed Changes

### 1. Camada de Dados & Motor Backend
(Mantido conforme implementação anterior - Status: OK)

### 2. Interface do Workflow de Squads (Frontend)
Editor de nós (canvas) para montar o fluxo.

#### [NEW] `dashboard/src/components/workflow/flow-builder.tsx`
- Implementação baseada em `@xyflow/react`.
- Suporte a Drag-and-Drop, Zoom, Pan e Conexões dinâmicas.
- **Custom Nodes:** Servidores (Hosts), Botões (Trigger/Intervenção), Agentes e Gatilhos.

## Phase 22: BullMQ Real-Time Background Engine ("Motor Real")

Transitioning from in-memory processing to a resilient Redis-backed queue.

### Proposed Changes

#### [NEW] [redis.ts](file:///c:/Users/Miguel/Desktop/miguel/sistemas-no-code/lumiplus/backend/src/lib/redis.ts)
- Centralized `ioredis` connection management.

#### [NEW] [workflow.worker.ts](file:///c:/Users/Miguel/Desktop/miguel/sistemas-no-code/lumiplus/backend/src/workers/workflow.worker.ts)
- Implement `bullmq` Worker that consumes `workflowRun` jobs.
- Move logic from `WorkflowRunnerService.processRun` to this worker.

#### [MODIFY] [workflow-runner.service.ts](file:///c:/Users/Miguel/Desktop/miguel/sistemas-no-code/lumiplus/backend/src/services/workflow-runner.service.ts)
- Refactor `triggerWorkflow` to use `workflowQueue.add()`.
- Add state validation to prevent duplicate runs.

## Phase 23: Human-in-the-loop Visual HUD ("HUD de Aprovação")

### Proposed Changes

#### [MODIFY] [flow-builder.tsx](file:///c:/Users/Miguel/Desktop/miguel/sistemas-no-code/lumiplus/dashboard/src/components/workflow/flow-builder.tsx)
- Add a pulsating "Wait/Pending" state to nodes.
- Overlay a "Review & Approve" button when its status is `waiting_approval`.

#### [MODIFY] `dashboard/src/app/workflows/page.tsx`
- Refatoração para comportar o `FlowBuilder` central.
- Adição de Sidebar de ferramentas para arrastar novos nós.

## Phase 24: Flow Builder — Interação e gestão de nós

Resolving critical UX friction reported by the user regarding node management and squad interactions.

### Proposed Changes

#### [MODIFY] [flow-builder.tsx](file:///c:/Users/Miguel/Desktop/miguel/sistemas-no-code/lumiplus/dashboard/src/components/workflow/flow-builder.tsx)
- **Individual Deletion**: Add a trash icon button to each node's header for individual deletion.
- **Node Instructions**: Add a text area/input field directly on `AgentNode` and `HumanApprovalNode` to allow real-time prompt editing.
- **Hierarchical Connections**: Ensure `SquadNode` (parent) doesn't catch clicks meant for subordinate nodes (z-index/event propagation).
- **Improved Dragging**: Implement a dedicated drag handle for `SquadNode` to allow moving the entire squad vs individual members.

## Phase 25: Spawn Agent Node — Agentes Criando Sub-Agentes

> Ver spec completa em [21_Spawn_Agent_Dinamico.md](./21_Spawn_Agent_Dinamico.md)

Adicionar ao canvas um novo tipo de nó que permite agentes criarem sub-agentes dinamicamente durante a execução do workflow.

### Novos Tipos de Nó

| Nó | Tipo | Comportamento |
|----|------|--------------|
| `SpawnAgentNode` | `spawn_agent` | Cria sub-agentes em paralelo, sequencial ou dinâmico |

### Proposed Changes

#### [NEW] `dashboard/src/components/workflow/nodes/SpawnAgentNode.tsx`
- Nó amarelo com ícone de faísca (SparklesIcon)
- HUD lateral para configurar: spawnType, lista de sub-agentes, modelo por agente, mandato
- Badge de profundidade máxima (default: 3)
- Status em tempo real: quantos sub-agentes ativos/concluídos

#### [MODIFY] [flow-builder.tsx](file:///c:/Users/Miguel/Desktop/miguel/sistemas-no-code/lumiplus/dashboard/src/components/workflow/flow-builder.tsx)
- Registrar `SpawnAgentNode` no mapa de `nodeTypes`
- Adicionar `SpawnAgentNode` na sidebar de tipos de nó disponíveis
- Escutar evento WebSocket `spawned_agent_status` para atualizar badges

#### [NEW] `src/services/SpawnAgentService.ts`
- `spawnAgents()` — cria registros em `spawned_agents` e enfileira jobs BullMQ
- `resolveAgentConfigs()` — resolve lista de sub-agentes (fixo ou via AI dinâmico)
- `cleanupSpawnedAgents()` — encerra sub-agentes pendentes ao fim do workflow

#### [MODIFY] `src/workers/workflow.worker.ts`
- Adicionar case `execute_spawned_agent` no dispatcher
- Emitir `spawned_agent_status` via WebSocket durante execução

### Limites de Segurança Obrigatórios
```
MAX_DEPTH: 3            (máx 3 níveis de aninhamento)
MAX_AGENTS_PER_SPAWN: 5 (máx 5 sub-agentes por nó)
MAX_TOTAL_SPAWNED: 20   (máx 20 sub-agentes por workflow_run)
TIMEOUT_SECONDS: 120    (timeout por sub-agente)
```

---

## Verification Plan

### Automated Tests
- Validar integridade do JSON exportado pelo Builder.
- Testar sincronização entre Chat e Canvas.
- [ ] Mock Redis and verify job insertion.
- [ ] Test server restart resilience (worker picking up a job after crash).

### Manual Verification
- Arrastar um "Servidor" para o canvas.
- Conectar um "Botão" a um "Agente".
- Descrever um fluxo no chat e ver a IA adicionando os nós automaticamente.
- [ ] Trigger a workflow with a `human_approval` node.
- [ ] Confirm the UI shows the "Waiting" indicator.
- [ ] Click approve and verify the workflow resumes.
