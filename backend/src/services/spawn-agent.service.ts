/**
 * SpawnAgentService — Agentes criando sub-agentes em tempo de execução.
 * Fase 21: parallel, sequential, conditional, dynamic.
 */

import { prisma } from '../lib/prisma.js';
import { AIService } from './ai.service.js';

const MAX_DEPTH = 3;
const MAX_AGENTS_PER_SPAWN = 5;
const MAX_TOTAL_PER_RUN = 20;
const TIMEOUT_MS = 120_000;

interface SpawnConfig {
  spawnType: 'parallel' | 'sequential' | 'conditional' | 'dynamic';
  agents?: Array<{
    name: string;
    mandate: string;
    model?: string;
    soulOverride?: { tone?: string; personality?: string };
  }>;
  dynamicInstruction?: string;
  condition?: string;
  conditionalAgent?: { name: string; mandate: string; model?: string };
  maxAgents?: number;
  maxDepth?: number;
  timeoutSeconds?: number;
}

export class SpawnAgentService {

  /** Cria sub-agentes no banco e retorna seus IDs */
  async spawn(params: {
    tenantId: string;
    parentAgentId: string;
    workflowRunId: string;
    nodeId: string;
    currentDepth: number;
    config: SpawnConfig;
    inputData: any;
  }) {
    // 1. Limite de profundidade
    const maxDepth = params.config.maxDepth ?? MAX_DEPTH;
    if (params.currentDepth >= maxDepth) {
      throw new Error(`Limite de profundidade atingido (max: ${maxDepth})`);
    }

    // 2. Limite total no workflow run
    const totalCount = await prisma.spawnedAgent.count({
      where: { workflowRunId: params.workflowRunId },
    });
    if (totalCount >= MAX_TOTAL_PER_RUN) {
      throw new Error(`Limite total de sub-agentes por execução: ${MAX_TOTAL_PER_RUN}`);
    }

    // 3. Resolver quais agentes criar
    const agentConfigs = await this.resolveConfigs(params);

    const maxAgents = params.config.maxAgents ?? MAX_AGENTS_PER_SPAWN;
    const limited = agentConfigs.slice(0, maxAgents);

    // 4. Criar registros
    const created = await prisma.$transaction(
      limited.map(cfg =>
        prisma.spawnedAgent.create({
          data: {
            tenantId: params.tenantId,
            parentAgentId: params.parentAgentId,
            workflowRunId: params.workflowRunId,
            nodeId: params.nodeId,
            name: cfg.name,
            mandate: cfg.mandate,
            primaryModel: cfg.model || null,
            soulOverride: cfg.soulOverride ?? null,
            depth: params.currentDepth + 1,
            spawnType: params.config.spawnType,
            status: 'pending',
            inputData: params.inputData,
          },
        })
      )
    );

    console.log(`[SpawnAgent] ✅ ${created.length} sub-agentes criados (depth: ${params.currentDepth + 1}) no run ${params.workflowRunId}`);
    return created;
  }

  /** Executa um sub-agente individualmente */
  async execute(spawnedAgentId: string) {
    const agent = await prisma.spawnedAgent.findUniqueOrThrow({
      where: { id: spawnedAgentId },
      include: { parentAgent: true },
    });

    await prisma.spawnedAgent.update({
      where: { id: spawnedAgentId },
      data: { status: 'running', startedAt: new Date() },
    });

    const timeoutMs = TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const soul = agent.soulOverride as any;
      const systemPrompt = [
        'Você é um sub-agente especialista criado para uma tarefa específica.',
        soul?.personality ? `Personalidade: ${soul.personality}` : '',
        soul?.tone ? `Tom: ${soul.tone}` : '',
        agent.mandate ? `\nMandato: ${agent.mandate}` : '',
        '\nExecute a tarefa e retorne o resultado de forma estruturada e concisa.',
      ].filter(Boolean).join('\n');

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: JSON.stringify(agent.inputData) },
      ];

      const result = await AIService.complete(
        agent.tenantId,
        agent.parentAgentId,
        messages,
        agent.primaryModel ? [agent.primaryModel] : undefined
      );

      clearTimeout(timeout);

      await prisma.spawnedAgent.update({
        where: { id: spawnedAgentId },
        data: {
          status: 'completed',
          outputData: { content: result.content, model: result.model, tokensUsed: result.tokensUsed },
          completedAt: new Date(),
        },
      });

      console.log(`[SpawnAgent] ✅ Sub-agente "${agent.name}" completou (${result.model})`);
      return result;
    } catch (err: any) {
      clearTimeout(timeout);
      await prisma.spawnedAgent.update({
        where: { id: spawnedAgentId },
        data: {
          status: 'failed',
          errorMessage: err.message?.slice(0, 500),
          completedAt: new Date(),
        },
      });
      console.error(`[SpawnAgent] ❌ Sub-agente "${agent.name}" falhou: ${err.message}`);
      throw err;
    }
  }

  /** Executa spawn: parallel (Promise.allSettled) ou sequential */
  async executeAll(spawnedAgents: Array<{ id: string }>, spawnType: string) {
    if (spawnType === 'sequential') {
      const results: any[] = [];
      for (const sa of spawnedAgents) {
        try {
          const r = await this.execute(sa.id);
          results.push({ id: sa.id, status: 'completed', result: r });
        } catch (err: any) {
          results.push({ id: sa.id, status: 'failed', error: err.message });
        }
      }
      return results;
    }

    // parallel (default)
    const settled = await Promise.allSettled(
      spawnedAgents.map(sa => this.execute(sa.id))
    );

    return settled.map((s, i) => ({
      id: spawnedAgents[i].id,
      status: s.status === 'fulfilled' ? 'completed' : 'failed',
      result: s.status === 'fulfilled' ? s.value : undefined,
      error: s.status === 'rejected' ? s.reason?.message : undefined,
    }));
  }

  /** Limpa sub-agentes pendentes/rodando ao finalizar workflow */
  async cleanup(workflowRunId: string) {
    await prisma.spawnedAgent.updateMany({
      where: {
        workflowRunId,
        status: { in: ['pending', 'running'] },
      },
      data: {
        status: 'failed',
        errorMessage: 'Workflow finalizado — sub-agentes encerrados',
        completedAt: new Date(),
      },
    });
  }

  /** Resolve configs baseado no spawnType */
  private async resolveConfigs(params: {
    tenantId: string;
    parentAgentId: string;
    config: SpawnConfig;
    inputData: any;
  }) {
    const { config } = params;

    if (config.spawnType === 'conditional') {
      // Avalia condição simples (truthy check no inputData)
      if (config.condition && config.conditionalAgent) {
        try {
          const inputStr = JSON.stringify(params.inputData);
          const conditionMet = inputStr.includes(config.condition) || config.condition === 'always';
          if (conditionMet) return [config.conditionalAgent];
        } catch {}
      }
      return [];
    }

    if (config.spawnType === 'dynamic') {
      return this.resolveWithAI(params);
    }

    // parallel ou sequential — usa lista fixa
    return config.agents ?? [];
  }

  /** Agente líder decide quais sub-agentes criar via IA */
  private async resolveWithAI(params: {
    tenantId: string;
    parentAgentId: string;
    config: SpawnConfig;
    inputData: any;
  }) {
    const instruction = params.config.dynamicInstruction || 'Analise a tarefa e defina sub-agentes necessários.';

    const messages = [
      {
        role: 'system' as const,
        content: `Você é um coordenador de equipe. Analise a tarefa e responda APENAS com um JSON array de sub-agentes necessários.
Formato obrigatório:
[{"name": "Nome do Sub-Agente", "mandate": "O que ele deve fazer", "model": "google/gemini-2.0-flash-001"}]
Máximo: ${MAX_AGENTS_PER_SPAWN} sub-agentes. Responda APENAS o JSON, sem explicações.`,
      },
      {
        role: 'user' as const,
        content: `${instruction}\n\nDados de entrada: ${JSON.stringify(params.inputData)}`,
      },
    ];

    const result = await AIService.complete(params.tenantId, params.parentAgentId, messages);

    try {
      // Extrai JSON da resposta
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return Array.isArray(parsed) ? parsed.slice(0, MAX_AGENTS_PER_SPAWN) : [];
      }
    } catch (e) {
      console.error('[SpawnAgent] Falha ao parsear resposta dinâmica:', result.content?.slice(0, 200));
    }

    return [];
  }
}

export const spawnAgentService = new SpawnAgentService();
