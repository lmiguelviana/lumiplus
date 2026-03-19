# Squad Builder — Correção e Conexão com Backend Real
Versão: 1.0 | PRIORIDADE MÁXIMA

---

## O Problema

O Workflow de Squads (canvas) foi construído como uma interface visual inicialmente desconectada do banco.
Os nós (Host Server, Manual Trigger, Agente) existem só no canvas — não
representam nem criam dados reais no banco. Clicar em "Disparar Agora"
não faz nada. "Adicionar Empregado" não cria agente nenhum.

**A solução não é reescrever o visual — é conectar o que já existe.**

O sistema já tem:
- Tabela `Agent` com todos os campos necessários
- Tabela `Squad` com campo `canvas_state JSONB`
- BullMQ com workflow_runs e workflow_steps (fase 19)
- Hierarquia boss/employee com `parentId` (fase 18)
- AIService funcionando com fallbacks

O canvas precisa apenas **ler e escrever no banco real**.

---

## 1. O que cada nó deve representar

### Nó "AGENTE" (já existe visualmente)
Representa um `Agent` real do banco de dados.

```typescript
// Ao renderizar o canvas, busca agentes reais do tenant
const agents = await prisma.agent.findMany({
  where: { tenantId: req.tenantId, deletedAt: null }
});

// Cada agente vira um nó no React Flow
const nodes = agents.map(agent => ({
  id: agent.id,
  type: 'agentNode',        // custom node type
  position: agent.canvasPosition ?? { x: 100, y: 100 },
  data: {
    label: agent.name,
    mission: agent.mission,
    model: agent.primaryModel,
    status: agent.status,   // active | paused | error
    isLeader: agent.isSquadLeader ?? false
  }
}));
```

### Nó "SQUAD UNIT" (o container azul)
Representa uma `Squad` real do banco.

```typescript
// Squad = grupo de agentes
const squads = await prisma.squad.findMany({
  where: { tenantId: req.tenantId },
  include: { agents: true }
});

const squadNodes = squads.map(squad => ({
  id: squad.id,
  type: 'squadNode',
  position: squad.canvasPosition ?? { x: 0, y: 0 },
  data: {
    label: squad.name,
    agentCount: squad.agents.length,
    status: squad.status
  }
}));
```

### Nó "MANUAL TRIGGER" (o laranja com "Disparar Agora")
Dispara uma execução real no BullMQ.

```typescript
// Botão "Disparar Agora" chama:
async function triggerSquad(squadId: string, objective: string) {
  const run = await prisma.workflowRun.create({
    data: {
      squadId,
      tenantId,
      status: 'running',
      objective,
      startedAt: new Date()
    }
  });

  // Adiciona job na fila BullMQ
  await squadQueue.add('execute_squad', {
    workflowRunId: run.id,
    squadId,
    objective,
    triggeredBy: 'manual'
  });

  return run;
}
```

### Nó "HOST SERVER"
Representa o servidor/workspace onde os agentes rodam.
É cosmético — mostra o nome do workspace e status da VPS.
Não precisa de lógica adicional.

---

## 2. "Adicionar Empregado" — o que deve fazer

O botão laranja "+ ADICIONAR EMPREGADO" deve:

```typescript
// 1. Abre modal de seleção
// → Lista agentes existentes do tenant que NÃO são líderes
// → OU opção de criar agente novo

// 2. Se seleciona agente existente:
async function addEmployeeToSquad(squadId: string, agentId: string) {
  await prisma.squadAgent.create({
    data: {
      squadId,
      agentId,
      tenantId,
      role: 'employee',    // leader | employee
      position: nextPosition
    }
  });

  // Atualiza canvas_state da squad
  await prisma.squad.update({
    where: { id: squadId },
    data: {
      canvasState: updatedCanvasJSON
    }
  });
}

// 3. Se cria agente novo:
// → Abre mini-wizard (nome + missão + modelo)
// → Cria agente no banco
// → Adiciona à squad automaticamente
// → Aparece no canvas como novo nó conectado ao líder
```

---

## 3. Conexão entre nós — o que as setas significam

No React Flow, quando o usuário conecta dois nós com uma seta:

```typescript
// onConnect callback do React Flow
async function onConnect(connection: Connection) {
  const { source, target } = connection;

  // Persiste no banco
  await prisma.workflowStep.create({
    data: {
      fromAgentId: source,
      toAgentId: target,
      squadId: currentSquadId,
      tenantId,
      stepType: 'delegation'  // líder → empregado
    }
  });

  // Salva canvas_state atualizado
  await saveCanvasState(currentSquadId, reactFlowInstance.toObject());
}
```

---

## 4. Persistência do canvas — salvar posições

O campo `canvas_state JSONB` na tabela `Squad` guarda tudo:

```typescript
// Salvar o estado do canvas
async function saveCanvasState(squadId: string, flowState: object) {
  await prisma.squad.update({
    where: { id: squadId },
    data: { canvasState: flowState }
  });
}

// Carregar ao abrir o canvas
async function loadCanvasState(squadId: string) {
  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { canvasState: true }
  });

  if (squad?.canvasState) {
    // Restaura posições, conexões, zoom
    return squad.canvasState as ReactFlowState;
  }

  // Se não tem state salvo, busca agentes e monta automaticamente
  return generateInitialLayout(squadId);
}
```

---

## 5. Status em tempo real — o "LIVE_SYNC"

O badge LIVE_SYNC que já aparece no canto superior direito precisa
mostrar dados reais via WebSocket (o mesmo já usado no portal de canais):

```typescript
// Backend — emite eventos quando agente muda de status
agentEmitter.on('status_change', (agentId, status) => {
  wsServer.clients.forEach(client => {
    if (client.tenantId === agent.tenantId) {
      client.send(JSON.stringify({
        type: 'agent_status',
        agentId,
        status   // active | running | paused | error
      }));
    }
  });
});

// Frontend — recebe e atualiza o nó no canvas
useEffect(() => {
  ws.onmessage = (event) => {
    const { type, agentId, status } = JSON.parse(event.data);
    if (type === 'agent_status') {
      setNodes(nodes => nodes.map(n =>
        n.id === agentId
          ? { ...n, data: { ...n.data, status } }
          : n
      ));
    }
  };
}, []);
```

---

## 6. Sidebar — arrastar nós para o canvas

A sidebar esquerda (que tem "CRIAR SQUAD UNIT" e "RECENTES") precisa
de uma seção para arrastar elementos:

```
SIDEBAR
├── CRIAR SQUAD UNIT     → cria Squad nova no banco
├── ADICIONAR AGENTE     → abre seleção de agente existente
│
├── RECENTES             → squads recentes (do banco, não mockado)
│   ├── AUTO_ONBOARDING
│   ├── WHATSAPP_BOT_V2
│   └── PDF_PROCESSOR
│
└── TIPOS DE NÓ (drag para o canvas)
    ├── [AGENTE]         → arrasta e cria agente
    ├── [TRIGGER]        → arrasta e configura gatilho
    └── [CONDIÇÃO]       → branch lógico (futuro)
```

---

## 7. Fluxo completo de execução de uma squad

Quando o usuário clica "DISPARAR AGORA":

```
1. Cria WorkflowRun no banco (status: running)
2. Identifica o agente líder da squad
3. Monta o contexto: soul + memória + objetivo
4. Coloca job na fila BullMQ
5. Worker pega o job:
   a. Agente líder analisa o objetivo
   b. Decide quais empregados chamar (tool calling)
   c. Cada empregado executa sua especialidade
   d. Resultado volta para o líder
   e. Líder consolida e entrega
6. WorkflowRun atualizado (status: completed)
7. Canvas mostra progresso em tempo real via WebSocket
```

---

## 8. O que NÃO precisa mudar

- O design visual (Industrial Ivory & Onyx) está ótimo
- O React Flow com zoom e hierarquia está correto
- O botão "+ ADICIONAR EMPREGADO" está no lugar certo
- O LIVE_SYNC badge está no lugar certo
- A sidebar com RECENTES está no lugar certo

**Só precisa conectar ao banco real.**

---

## 9. Checklist de implementação

```
Conexão Backend (Fase 20):
[ ] GET /v1/squads/:id/canvas — retorna nodes + edges do banco
[ ] POST /v1/squads/:id/canvas — salva canvas_state
[ ] POST /v1/squads/:id/employees — adiciona agente à squad
[ ] POST /v1/squads/:id/trigger — dispara execução no BullMQ
[ ] GET /v1/squads — lista squads reais (substituir mockados)
[ ] onConnect no canvas salva edge no banco
[ ] onNodeDragStop salva posição no canvas_state
[ ] WebSocket emite status de agente em tempo real
[ ] Modal de "Adicionar Empregado" lista agentes reais do tenant
[ ] "CRIAR SQUAD UNIT" cria Squad no banco e abre no canvas

Spawn Agent (Fase 21 — adicional):
[ ] Criar tabela spawned_agents no Prisma schema
[ ] Adicionar SpawnAgentNode na sidebar de tipos de nó
[ ] Registrar SpawnAgentNode no mapa nodeTypes do React Flow
[ ] HUD lateral para configurar spawnType + lista de sub-agentes
[ ] Endpoint POST /v1/squads/:id/spawn — iniciar spawn dentro de execução
[ ] WebSocket evento spawned_agent_status para atualizar badges no canvas
[ ] Cleanup automático de spawned_agents ao finalizar workflow_run
```

---

## 10. Mensagem para o Antigravity

**O visual do Workflow de Squads está excelente. O problema é que os dados são
todos mockados/locais. A tarefa agora é:**

1. Substituir todos os dados hardcoded por chamadas reais à API
2. Persistir o canvas_state no campo `Squad.canvasState` do banco
3. Conectar o botão "Disparar Agora" ao BullMQ (já existe na fase 19)
4. Conectar "Adicionar Empregado" ao endpoint de criação de agente
5. Usar o mesmo WebSocket do portal de canais para o LIVE_SYNC

**Não reescrever o componente. Só conectar ao backend.**
