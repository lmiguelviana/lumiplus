import { Worker, Job } from 'bullmq';
import { redis, isRedisAvailable } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { SwarmService } from '../services/swarm.service.js';
import { AIService } from '../services/ai.service.js';
import { KnowledgeService } from '../services/knowledge.service.js';
import { notifyHumanApproval } from '../services/workflow-approval-notify.service.js';
import { workflowEvents } from '../lib/ws-events.js';
import { spawnAgentService } from '../services/spawn-agent.service.js';


/**
 * Worker do BullMQ responsável por processar os nós de um workflow assincronamente.
 * 
 * Este worker realiza o processamento pesado de IA sem travar o Event Loop do Fastify.
 */
/**
 * Lógica central de processamento de um Run.
 * Pode ser chamada via BullMQ ou diretamente (fallback).
 */
export async function processWorkflowRun(runId: string) {
  console.log(`[WorkflowProcessor] Iniciando processamento do Run: ${runId}`);

  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflow: true }
  });

  if (!run || (run.status !== 'running' && run.status !== 'waiting_approval')) {
      console.warn(`[WorkflowProcessor] Run ${runId} não está em estado processável (Status: ${run?.status}).`);
      return;
  }

  const definition = run.workflow.definition as any;
  let state = run.state as any;

  try {
    let isCompleted = false;
    const MAX_STEPS = 20; 
    let steps = 0;

    while (!isCompleted && steps < MAX_STEPS) {
      steps++;
      const currentNodeId = state.currentNode;

      let node: any = null;
      if (currentNodeId === 'start') {
        node = { id: 'start', type: 'system', output: 'started' };
      } else {
        node = definition.nodes?.find((n: any) => n.id === currentNodeId);
      }

      if (!node) {
        isCompleted = true;
        break;
      }

      let nodeResult: any = null;

      if (node.id !== 'start') {
        // Criar registro da Task (MANDATO)
        const task = await prisma.workflowTask.create({
          data: {
            tenantId: run.tenantId,
            runId: run.id,
            agentId: node.data?.agentId || node.agentId || null,
            status: 'in_progress',
            startedAt: new Date(),
            input: { prompt: node.prompt, payloadSnapshot: state.payload }
          }
        });

        console.log(`[WorkflowProcessor] Executando nó: ${node.id} (${node.type})`);

        // Emite status 'running' para o canvas via WebSocket
        const nodeAgentId = node.data?.agentId || node.agentId;
        if (nodeAgentId) {
          workflowEvents.emit('agent_status', { tenantId: run.tenantId, agentId: nodeAgentId, status: 'running', runId });
        }

        if (node.type === 'agent' || node.type === 'agent_task') {
          let agentId = node.data?.agentId || node.agentId;

          // Se não houver agente no nó, tenta encontrar o agente padrão do tenant
          if (!agentId) {
            const defaultAgent = await prisma.agent.findFirst({
              where: { tenantId: run.tenantId, slug: { in: ['lumi-bot', 'main', 'helper'] } }
            });
            agentId = defaultAgent?.id;
          }

          if (!agentId) {
            throw new Error(`Nenhum agente atribuído ao nó ${node.id} e nenhum agente padrão encontrado.`);
          }

          const taskPrompt = node.data?.prompt || node.prompt || '';
          let userContent = `DADOS DISPONÍVEIS:\n${JSON.stringify(state.payload, null, 2)}\n\nSUA TAREFA:\n${taskPrompt}`;

          // RAG: injeta contexto do conhecimento do agente (memória .md, documentos)
          try {
            const query = [taskPrompt, JSON.stringify(state.payload)].filter(Boolean).join(' ').slice(0, 500);
            const ragResults = await KnowledgeService.search(run.tenantId, agentId, query, 5);
            if (ragResults.length > 0) {
              const contextBlock = ragResults.map((r, i) => `[Contexto ${i + 1}]\n${r.content}`).join('\n\n');
              userContent = `CONTEXTO DA SUA MEMÓRIA (use para enriquecer a resposta):\n${contextBlock}\n\n---\n\n${userContent}`;
            }
          } catch (ragErr) {
            console.warn('[WorkflowProcessor] RAG opcional falhou:', (ragErr as Error).message);
          }

          const response = await AIService.complete(run.tenantId, agentId, [
            { role: 'user', content: userContent }
          ]);
          nodeResult = response.content;
        } else if (node.type === 'squad' || node.type === 'squad_task') {
          const squadObjective = node.data?.objective
            || state.payload?.objective
            || node.data?.prompt
            || node.prompt
            || `Executar missão da squad.`;
          nodeResult = await SwarmService.executeSquadTask(
            run.tenantId,
            node.data?.squadId || node.squadId,
            squadObjective,
            run.id
          );
        } else if (node.type === 'human_approval') {
           // Pausa o processador
           await prisma.workflowRun.update({
             where: { id: runId },
             data: { status: 'waiting_approval', state }
           });
           await prisma.workflowTask.update({
             where: { id: task.id },
             data: { status: 'pending', output: { message: 'Aguardando aprovação humana.' } }
           });
           console.log(`[WorkflowProcessor] Run ${runId} pausado para aprovação humana.`);

           // Notificação ao humano via Telegram/WhatsApp (se configurado no nó e no workspace)
           const nodeData = node.data || {};
           if (nodeData.notifyTelegram || nodeData.notifyWhatsapp) {
             notifyHumanApproval({
               tenantId: run.tenantId,
               runId,
               nodeLabel: nodeData.label,
               notifyTelegram: !!nodeData.notifyTelegram,
               notifyWhatsapp: !!nodeData.notifyWhatsapp
             }).catch(err => console.warn('[WorkflowProcessor] Notificação aprovação:', (err as Error).message));
           }
           return; // ENCERRA ESTE JOB. Será retomado via resumeWorkflow.
        } else if (node.type === 'spawn_agent') {
          // Fase 21: Spawn Agent Dinâmico
          const spawnConfig = node.data?.spawnConfig || { spawnType: 'parallel', agents: [] };
          const currentDepth = (state.spawnDepth || 0);

          workflowEvents.emit('spawn_status', {
            tenantId: run.tenantId, runId, nodeId: node.id,
            status: 'spawning', activeCount: 0, completedCount: 0,
          });

          // Criar sub-agentes
          const spawned = await spawnAgentService.spawn({
            tenantId: run.tenantId,
            parentAgentId: node.data?.parentAgentId || node.data?.agentId,
            workflowRunId: run.id,
            nodeId: node.id,
            currentDepth,
            config: spawnConfig,
            inputData: state.payload,
          });

          workflowEvents.emit('spawn_status', {
            tenantId: run.tenantId, runId, nodeId: node.id,
            status: 'running', activeCount: spawned.length, completedCount: 0,
          });

          // Executar todos (parallel ou sequential)
          const results = await spawnAgentService.executeAll(spawned, spawnConfig.spawnType);

          const completedCount = results.filter(r => r.status === 'completed').length;
          workflowEvents.emit('spawn_status', {
            tenantId: run.tenantId, runId, nodeId: node.id,
            status: 'completed', activeCount: 0, completedCount,
          });

          // Consolidar outputs
          const consolidatedResults = results.map(r => ({
            id: r.id,
            status: r.status,
            output: r.result?.content || r.error || 'sem resultado',
          }));

          nodeResult = JSON.stringify(consolidatedResults);
          console.log(`[WorkflowProcessor] SpawnAgent concluído: ${completedCount}/${spawned.length} sub-agentes OK`);
        }

        // Concluir Task
        await prisma.workflowTask.update({
          where: { id: task.id },
          data: { status: 'completed', endedAt: new Date(), output: { result: nodeResult } }
        });

        // Emite status 'completed' para o canvas via WebSocket
        if (nodeAgentId) {
          workflowEvents.emit('agent_status', { tenantId: run.tenantId, agentId: nodeAgentId, status: 'completed', runId });
        }
      } else {
        nodeResult = 'Workflow iniciado';
      }

      state.history.push({ nodeId: currentNodeId, result: nodeResult, timestamp: Date.now() });
      if (currentNodeId !== 'start') {
        state.payload = { ...state.payload, [currentNodeId]: nodeResult };
      }

      // Transição para o próximo nó
      let outgoingEdges = definition.edges?.filter((e: any) => e.source === currentNodeId);
      if (currentNodeId === 'start' && (!outgoingEdges || outgoingEdges.length === 0)) {
        // Canvas sem nó "start": usa o primeiro nó da definição
        const firstNode = definition.nodes?.find((n: any) => n.id !== 'start');
        if (firstNode) state.currentNode = firstNode.id;
        else isCompleted = true;
      } else if (!outgoingEdges || outgoingEdges.length === 0) {
        isCompleted = true;
      } else {
        state.currentNode = outgoingEdges[0].target;
      }

      // Update progress
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { state }
      });
    }

    // Marcar Sucesso Total + cleanup de sub-agentes pendentes
    await spawnAgentService.cleanup(runId);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'completed', endedAt: new Date(), state }
    });
    console.log(`[WorkflowProcessor] Run ${runId} concluído com sucesso.`);

  } catch (err: any) {
    console.error(`[WorkflowProcessor] Erro crítico no Run ${runId}:`, err);
    state.lastError = err.message;
    await spawnAgentService.cleanup(runId);
    await prisma.workflowRun.update({
       where: { id: runId },
       data: { status: 'failed', error: err.message, endedAt: new Date(), state }
    });
    // Emite falha para todos os agentes ativos do run
    workflowEvents.emit('run_failed', { tenantId: run.tenantId, runId, error: err.message });
  }
}

/**
 * Worker do BullMQ. Só ativado se o Redis estiver online.
 */
if (isRedisAvailable) {
  const worker = new Worker(
    'workflow-queue',
    async (job: Job) => {
      await processWorkflowRun(job.data.runId);
    },
    { 
      connection: redis as any,
      concurrency: 5 
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[WorkflowWorker] Job ${job?.id} falhou:`, err);
  });

  console.log('👷 BullMQ Worker ativado.');
} else {
  console.warn('⚠️ BullMQ Worker desativado (Redis Offline). Usando processamento direto em memória.');
}
