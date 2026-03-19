# Fase 21: Spawn Agent Dinâmico — Agentes Criando Sub-Agentes
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

A capacidade mais poderosa do Lumi Plus é permitir que **agentes criem e coordenem seus próprios sub-agentes em tempo de execução**, diretamente no canvas do Squad Builder.

Isso vai além da hierarquia boss/employee estática (Fase 18). Aqui, um agente analisa uma tarefa e decide dinamicamente:
- Quantos sub-agentes são necessários
- Qual soul/mandato cada um recebe
- Qual modelo de IA cada um usa
- Quando os sub-agentes são destruídos

---

## 1. Conceito: Nó `SpawnAgentNode`

Um novo tipo de nó no React Flow canvas. Representa o ponto onde um agente "pai" gera filhos dinamicamente durante a execução.

```
[ TRIGGER ] → [ AGENTE LÍDER ] → [ SPAWN AGENT ] → [ sub-agente A ]
                                          ↓         → [ sub-agente B ]
                                          ↓         → [ sub-agente C ]
                                    [ CONSOLIDAR ] → [ RESPOSTA ]
```

### Tipos de Spawn

| Tipo | Comportamento |
|------|--------------|
| `parallel` | Todos os sub-agentes rodam ao mesmo tempo (fan-out) |
| `sequential` | Sub-agentes rodam em ordem, saída de um vai para o próximo |
| `conditional` | Sub-agente criado somente se condição for verdadeira |
| `dynamic` | Agente líder decide quantos criar em tempo de execução |

---

## 2. Schema — Banco de Dados

### Tabela `spawned_agents`

```sql
CREATE TABLE spawned_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  parent_agent_id UUID NOT NULL REFERENCES agents(id),
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id),
  workflow_step_id UUID REFERENCES workflow_steps(id),

  -- Configuração dinâmica do sub-agente
  name            TEXT NOT NULL,
  soul_override   JSONB,          -- soul temporário (sobrescreve o pai)
  mandate         TEXT,           -- instrução específica desta instância
  primary_model   TEXT,           -- modelo para esta tarefa
  fallback_models TEXT[],

  -- Controle de vida
  depth           INT NOT NULL DEFAULT 0,  -- nível na árvore (max: 3)
  status          TEXT DEFAULT 'pending',  -- pending | running | completed | failed
  input_data      JSONB,
  output_data     JSONB,

  -- Auditoria
  created_at      TIMESTAMPTZ DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT
);

-- Índices
CREATE INDEX idx_spawned_agents_workflow_run ON spawned_agents(workflow_run_id);
CREATE INDEX idx_spawned_agents_parent ON spawned_agents(parent_agent_id);
CREATE INDEX idx_spawned_agents_tenant ON spawned_agents(tenant_id);

-- RLS
ALTER TABLE spawned_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON spawned_agents
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### Campo adicional em `workflow_steps`

```sql
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS
  spawn_config JSONB;  -- configuração do SpawnAgentNode
```

---

## 3. Configuração do Nó no Canvas

O usuário configura o SpawnAgentNode arrastando-o para o canvas e preenchendo o HUD lateral:

```typescript
// Estrutura de configuração do nó
interface SpawnAgentNodeConfig {
  spawnType: 'parallel' | 'sequential' | 'conditional' | 'dynamic';

  // Para tipos fixos (parallel/sequential):
  agents?: Array<{
    name: string;
    mandate: string;       // instrução específica
    model: string;         // modelo de IA
    soulOverride?: {       // personalidade temporária
      tone?: string;
      personality?: string;
    };
  }>;

  // Para tipo 'dynamic':
  // O agente líder decide via tool calling
  dynamicInstruction?: string;  // ex: "Crie um agente para cada item da lista"

  // Para tipo 'conditional':
  condition?: string;       // ex: "{{input.complexity}} > 'high'"
  conditionalAgent?: {
    name: string;
    mandate: string;
    model: string;
  };

  // Limites de segurança
  maxAgents?: number;       // padrão: 5
  maxDepth?: number;        // padrão: 3
  timeoutSeconds?: number;  // padrão: 120
}
```

---

## 4. Implementação Backend

### `SpawnAgentService`

```typescript
// src/services/SpawnAgentService.ts

import { prisma } from '../lib/prisma';
import { AIService } from './AIService';

const MAX_DEPTH = 3;
const MAX_AGENTS_PER_SPAWN = 5;

export class SpawnAgentService {

  async spawnAgents(params: {
    workflowRunId: string;
    workflowStepId: string;
    parentAgentId: string;
    tenantId: string;
    currentDepth: number;
    config: SpawnAgentNodeConfig;
    inputData: any;
  }): Promise<SpawnedAgent[]> {

    // 1. Verificar limite de profundidade (anti-loop)
    if (params.currentDepth >= MAX_DEPTH) {
      throw new Error(`Limite de profundidade atingido (max: ${MAX_DEPTH})`);
    }

    // 2. Determinar quais agentes criar
    const agentConfigs = await this.resolveAgentConfigs(params);

    // 3. Verificar limite de sub-agentes
    if (agentConfigs.length > MAX_AGENTS_PER_SPAWN) {
      throw new Error(`Limite de sub-agentes por spawn: ${MAX_AGENTS_PER_SPAWN}`);
    }

    // 4. Criar registros no banco
    const spawnedAgents = await prisma.$transaction(
      agentConfigs.map(config =>
        prisma.spawnedAgent.create({
          data: {
            tenantId: params.tenantId,
            parentAgentId: params.parentAgentId,
            workflowRunId: params.workflowRunId,
            workflowStepId: params.workflowStepId,
            name: config.name,
            soulOverride: config.soulOverride ?? null,
            mandate: config.mandate,
            primaryModel: config.model,
            depth: params.currentDepth + 1,
            status: 'pending',
            inputData: params.inputData
          }
        })
      )
    );

    return spawnedAgents;
  }

  private async resolveAgentConfigs(params: any) {
    if (params.config.spawnType === 'dynamic') {
      // Agente líder decide quantos criar via tool calling
      return this.resolveWithAI(params);
    }
    return params.config.agents ?? [];
  }

  private async resolveWithAI(params: any) {
    // Chama o agente pai com instrução para definir os sub-agentes
    const aiService = new AIService();
    const result = await aiService.callWithTools({
      agentId: params.parentAgentId,
      tenantId: params.tenantId,
      message: `${params.config.dynamicInstruction}\n\nInput: ${JSON.stringify(params.inputData)}`,
      tools: ['define_subagents']
    });

    return result.toolResult?.agents ?? [];
  }

  // Cleanup ao finalizar workflow
  async cleanupSpawnedAgents(workflowRunId: string): Promise<void> {
    await prisma.spawnedAgent.updateMany({
      where: {
        workflowRunId,
        status: { in: ['pending', 'running'] }
      },
      data: {
        status: 'failed',
        errorMessage: 'Workflow finalizado — sub-agentes encerrados',
        completedAt: new Date()
      }
    });
  }
}
```

### Worker BullMQ — executar sub-agente

```typescript
// Em workflow.worker.ts — adicionar handler para spawned agents

case 'execute_spawned_agent': {
  const { spawnedAgentId } = job.data;
  const spawnedAgent = await prisma.spawnedAgent.findUniqueOrThrow({
    where: { id: spawnedAgentId }
  });

  // Marcar como rodando
  await prisma.spawnedAgent.update({
    where: { id: spawnedAgentId },
    data: { status: 'running', startedAt: new Date() }
  });

  // Executar com AIService usando configuração dinâmica
  const result = await aiService.call({
    model: spawnedAgent.primaryModel,
    systemPrompt: buildSpawnedAgentPrompt(spawnedAgent),
    userMessage: JSON.stringify(spawnedAgent.inputData),
    tenantId: spawnedAgent.tenantId
  });

  // Salvar resultado
  await prisma.spawnedAgent.update({
    where: { id: spawnedAgentId },
    data: {
      status: 'completed',
      outputData: { result },
      completedAt: new Date()
    }
  });

  return result;
}

function buildSpawnedAgentPrompt(agent: SpawnedAgent): string {
  const soul = agent.soulOverride as any;
  return `
Você é um agente especialista criado para esta tarefa específica.

${soul?.personality ? `Personalidade: ${soul.personality}` : ''}
${soul?.tone ? `Tom: ${soul.tone}` : ''}

Mandato: ${agent.mandate}

Execute sua tarefa e retorne o resultado estruturado.
  `.trim();
}
```

---

## 5. Frontend — Canvas

### SpawnAgentNode component

```typescript
// dashboard/src/components/workflow/nodes/SpawnAgentNode.tsx

export function SpawnAgentNode({ data, id }: NodeProps<SpawnAgentNodeConfig>) {
  const { spawnType, agents = [] } = data;

  return (
    <div className="spawn-agent-node border-2 border-yellow-500 bg-zinc-900 rounded-lg p-3 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <SparklesIcon className="w-4 h-4 text-yellow-400" />
        <span className="text-xs font-bold text-yellow-400 uppercase">
          Spawn Agent
        </span>
        <span className="text-xs text-zinc-500 ml-auto">{spawnType}</span>
      </div>

      {/* Lista de sub-agentes configurados */}
      {agents.map((agent, i) => (
        <div key={i} className="text-xs text-zinc-400 border-l border-zinc-700 pl-2 my-1">
          <span className="text-white">{agent.name}</span>
          <span className="ml-1 text-zinc-600">— {agent.model}</span>
        </div>
      ))}

      {spawnType === 'dynamic' && (
        <div className="text-xs text-zinc-500 italic">
          Sub-agentes definidos em tempo de execução
        </div>
      )}

      {/* Badge de profundidade */}
      <div className="absolute -top-2 -right-2 bg-yellow-500 text-black
                      text-[10px] font-bold rounded-full w-4 h-4
                      flex items-center justify-center">
        {data.maxDepth ?? 3}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

### Status em tempo real no canvas

```typescript
// Quando sub-agentes estão rodando, os nós pulsam no canvas
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'spawned_agent_status') {
    // Atualiza o nó pai com quantos filhos estão rodando
    setNodes(nodes => nodes.map(n =>
      n.id === msg.spawnNodeId
        ? { ...n, data: { ...n.data,
            activeChildren: msg.activeCount,
            completedChildren: msg.completedCount
          }}
        : n
    ));
  }
};
```

---

## 6. Limites de Segurança (Anti-Loop)

```typescript
// Regras obrigatórias — aplicadas no SpawnAgentService

const SAFETY_LIMITS = {
  MAX_DEPTH: 3,              // max 3 níveis de aninhamento
  MAX_AGENTS_PER_SPAWN: 5,   // max 5 sub-agentes por nó Spawn
  MAX_TOTAL_SPAWNED: 20,     // max 20 sub-agentes por workflow_run
  TIMEOUT_SECONDS: 120,      // timeout por sub-agente
  CLEANUP_ON_FAILURE: true   // limpar sub-agentes ao falhar
};

// Verificação de total no workflow
async function checkTotalSpawnLimit(workflowRunId: string): Promise<void> {
  const count = await prisma.spawnedAgent.count({
    where: { workflowRunId }
  });
  if (count >= SAFETY_LIMITS.MAX_TOTAL_SPAWNED) {
    throw new Error(`Limite total de sub-agentes atingido (${SAFETY_LIMITS.MAX_TOTAL_SPAWNED})`);
  }
}
```

---

## 7. Checklist de Implementação

```
[x] Criar model SpawnedAgent no Prisma schema ✅ 18/03/2026
[x] SpawnAgentService: spawn, execute, executeAll, cleanup, resolveWithAI ✅ 18/03/2026
[x] Case 'spawn_agent' no workflow.worker.ts com WebSocket events ✅ 18/03/2026
[x] SpawnAgentNode component no React Flow (parallel, sequential, conditional, dynamic) ✅ 18/03/2026
[x] Botão + SPAWN na toolbar do canvas e sidebar ✅ 18/03/2026
[x] WebSocket spawn_status (spawning, running, completed) em tempo real ✅ 18/03/2026
[x] cleanupSpawnedAgents no fim de cada workflow_run (success + failure) ✅ 18/03/2026
[x] Limites de segurança: MAX_DEPTH=3, MAX_AGENTS_PER_SPAWN=5, MAX_TOTAL_PER_RUN=20, TIMEOUT=120s ✅ 18/03/2026
[ ] Testes: parallel spawn, sequential spawn, dynamic spawn
[ ] Testes: limite de profundidade (deve bloquear no nível 4)
```

---

## 8. Exemplo de Uso Real

**Caso: Pesquisa de Mercado Automatizada**

```
[ TRIGGER: "Analise os concorrentes do mercado de CRM" ]
  → [ AGENTE LÍDER: Coordenador de Pesquisa ]
  → [ SPAWN AGENT (parallel) ]
      ├── Sub-agente A: "Pesquise HubSpot" — model: gpt-4o — web_search
      ├── Sub-agente B: "Pesquise Salesforce" — model: claude-sonnet — web_search
      └── Sub-agente C: "Pesquise Pipedrive" — model: gemini-flash — web_search
  → [ AGENTE CONSOLIDADOR: resume os 3 relatórios ]
  → [ RESPOSTA FINAL ]
```

Tempo total estimado: ~15s (paralelo) vs ~45s (sequencial sem spawn)
