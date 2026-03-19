import { prisma } from '../lib/prisma.js';
import { Queue } from 'bullmq';
import { redis, isRedisAvailable } from '../lib/redis.js';
import { processWorkflowRun } from '../workers/workflow.worker.js';


/**
 * Fila de execução de workflows. Só ativada se Redis disponível.
 */
export const workflowQueue = isRedisAvailable 
  ? new Queue('workflow-queue', { connection: redis as any })
  : null;

export class WorkflowRunnerService {
  /**
   * Inicia a execução de um workflow a partir de um evento/trigger (ex: webhook, cron, chat).
   */
  static async triggerWorkflow(tenantId: string, workflowId: string, inputPayload: any) {
    const run = await prisma.workflowRun.create({
      data: {
        tenantId,
        workflowId,
        status: 'running',
        startedAt: new Date(),
        state: {
          currentNode: 'start',
          payload: inputPayload,
          history: []
        }
      }
    });

    // Adiciona o Run na fila do BullMQ ou processa diretamente
    if (workflowQueue && isRedisAvailable) {
      await workflowQueue.add(`run-${run.id}`, { runId: run.id });
      console.log(`[WorkflowRunner] Run ${run.id} enfileirado no BullMQ.`);
    } else {
      console.log(`[WorkflowRunner] Redis Offline. Processando Run ${run.id} em memória.`);
      // Não bloqueamos a resposta, processamos de forma assíncrona
      processWorkflowRun(run.id).catch(err => console.error('[WorkflowRunner] Erro no processamento manual:', err));
    }

    return run;
  }

  /**
   * Retoma um workflow pausado (ex: aprovação humana concedida)
   */
  static async resumeWorkflow(runId: string, approvalData?: any) {
    const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'waiting_approval') {
      throw new Error('Workflow não encontrado ou não está aguardando aprovação.');
    }

    const state = run.state as any;
    if (approvalData) {
      state.payload = { ...state.payload, humanInput: approvalData };
    }

    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'running', state }
    });

    // Re-enfileira ou processa diretamente
    if (workflowQueue && isRedisAvailable) {
      await workflowQueue.add(`resume-${run.id}`, { runId: run.id });
      console.log(`[WorkflowRunner] Run ${run.id} retomado e enfileirado no BullMQ.`);
    } else {
      console.log(`[WorkflowRunner] Redis Offline. Retomando Run ${run.id} em memória.`);
      processWorkflowRun(run.id).catch(err => console.error('[WorkflowRunner] Erro na retomada manual:', err));
    }
    return true;
  }
}
