import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { WorkflowRunnerService } from '../services/workflow-runner.service.js';
import { workflowEvents } from '../lib/ws-events.js';
import { KnowledgeService } from '../services/knowledge.service.js';


export default async function squadRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // WebSocket: LIVE_SYNC — emite status de agentes em tempo real para o canvas
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const { tenantId: qTenantId } = (req.query as any) || {};

    // Fallback: tenta extrair tenantId do JWT (se disponível)
    let tenantId = qTenantId;
    try {
      const user = (req as any).user as any;
      if (user?.tenantId) tenantId = user.tenantId;
    } catch (_) {}

    const onAgentStatus = (data: any) => {
      if (!tenantId || data.tenantId === tenantId) {
        try {
          connection.send(JSON.stringify({ type: 'agent_status', agentId: data.agentId, status: data.status, runId: data.runId }));
        } catch (_) {}
      }
    };

    const onRunFailed = (data: any) => {
      if (!tenantId || data.tenantId === tenantId) {
        try {
          connection.send(JSON.stringify({ type: 'run_failed', runId: data.runId, error: data.error }));
        } catch (_) {}
      }
    };

    workflowEvents.on('agent_status', onAgentStatus);
    workflowEvents.on('run_failed', onRunFailed);

    connection.on('close', () => {
      workflowEvents.off('agent_status', onAgentStatus);
      workflowEvents.off('run_failed', onRunFailed);
    });
  });

  // Lista todas as squads do tenant
  fastify.get('/', async (request, reply) => {
    const { tenantId } = request.user as any;
    const squads = await prisma.squad.findMany({
      where: { tenantId },
      include: {
        members: {
          include: { agent: { select: { id: true, name: true, status: true, primaryModel: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ squads });
  });

  // Cria uma nova squad
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { name, description } = request.body as { name: string; description?: string };

    if (!name?.trim()) {
      return reply.status(400).send({ error: 'Nome é obrigatório' });
    }

    const squad = await prisma.squad.create({
      data: { tenantId, name: name.trim(), description }
    });
    return reply.status(201).send({ squad });
  });

  // Carrega o canvas state de uma squad (ou gera layout automático dos membros)
  fastify.get('/:id/canvas', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    const squad = await prisma.squad.findUnique({
      where: { id, tenantId },
      include: {
        members: {
          include: { agent: { select: { id: true, name: true, mission: true, primaryModel: true, status: true } } }
        }
      }
    });

    if (!squad) return reply.status(404).send({ error: 'Squad não encontrada' });

    // Se já tem canvas salvo, retorna direto
    if (squad.canvasState) {
      return reply.send({ canvas: squad.canvasState, squad });
    }

    // Gera layout inicial a partir dos membros
    const nodes = squad.members.map((m, i) => ({
      id: `agent-${m.agentId}`,
      type: 'agent',
      position: { x: 100 + (i % 3) * 340, y: 80 + Math.floor(i / 3) * 260 },
      data: {
        label: m.agent.name,
        agentId: m.agent.id,
        mission: m.agent.mission,
        status: 'idle',
        role: m.role
      }
    }));

    // Liga o primeiro ao restante (líder → empregados)
    const edges = nodes.slice(1).map((n) => ({
      id: `e-${nodes[0]?.id}-${n.id}`,
      source: nodes[0]?.id,
      target: n.id,
      animated: true,
      style: { stroke: 'var(--accent)' }
    }));

    return reply.send({ canvas: { nodes, edges }, squad });
  });

  // Salva o canvas state + sincroniza SquadMembers pelos nós com agentId
  fastify.post('/:id/canvas', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const state = body?.state ?? body; // aceita { state: {...} } ou direto { nodes, edges }

    if (!state) return reply.status(400).send({ error: 'state é obrigatório' });

    const squad = await prisma.squad.findUnique({ where: { id, tenantId } });
    if (!squad) return reply.status(404).send({ error: 'Squad não encontrada' });

    // Sanitiza o state para remover undefined/funções que quebram o JSON do Prisma
    let safeState: any;
    try {
      safeState = JSON.parse(JSON.stringify(state));
    } catch (parseErr) {
      return reply.status(400).send({ error: 'Canvas state inválido (não é JSON serializável)' });
    }

    try {
      await prisma.squad.update({
        where: { id },
        data: { canvasState: safeState }
      });
    } catch (updateErr: any) {
      fastify.log.error('Erro ao salvar canvasState:', updateErr?.message);
      return reply.status(500).send({ error: 'Falha ao salvar canvas: ' + updateErr?.message });
    }

    // Sincroniza SquadMembers (não-fatal — não quebra o save se falhar)
    try {
      const agentNodes = (state.nodes || []).filter(
        (n: any) => n.type === 'agent' && n.data?.agentId
      );

      // Também sincroniza o líder definido no SquadNode
      const squadNodes = (state.nodes || []).filter(
        (n: any) => n.type === 'squad' && n.data?.leaderId
      );
      const leaderIds = squadNodes.map((n: any) => n.data.leaderId);

      const allAgentIds = [
        ...agentNodes.map((n: any) => n.data.agentId),
        ...leaderIds,
      ].filter(Boolean);

      for (const agentId of [...new Set(allAgentIds)]) {
        const isLeader = leaderIds.includes(agentId);
        const agentExists = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
        if (!agentExists) continue;

        await prisma.squadMember.upsert({
          where: { squadId_agentId: { squadId: id, agentId } },
          update: { role: isLeader ? 'leader' : 'member' },
          create: { squadId: id, agentId, role: isLeader ? 'leader' : 'member' }
        });
      }
    } catch (syncErr: any) {
      fastify.log.warn('SquadMember sync não-fatal:', syncErr?.message);
    }

    return reply.send({ ok: true });
  });

  // Adiciona um agente à squad (endpoint direto)
  fastify.post('/:id/employees', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const { agentId, role } = request.body as { agentId: string; role?: string };

    if (!agentId) return reply.status(400).send({ error: 'agentId é obrigatório' });

    const [squad, agent] = await Promise.all([
      prisma.squad.findUnique({ where: { id, tenantId } }),
      prisma.agent.findUnique({ where: { id: agentId, tenantId } })
    ]);

    if (!squad) return reply.status(404).send({ error: 'Squad não encontrada' });
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' });

    const member = await prisma.squadMember.upsert({
      where: { squadId_agentId: { squadId: id, agentId } },
      update: { role: role || 'member' },
      create: { squadId: id, agentId, role: role || 'member' }
    });

    return reply.status(201).send({ member, agent });
  });

  // Remove um agente da squad
  fastify.delete('/:id/employees/:agentId', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id, agentId } = request.params as { id: string; agentId: string };

    const squad = await prisma.squad.findUnique({ where: { id, tenantId } });
    if (!squad) return reply.status(404).send({ error: 'Squad não encontrada' });

    await prisma.squadMember.deleteMany({ where: { squadId: id, agentId } });
    return reply.send({ ok: true });
  });

  // Dispara a execução da squad via BullMQ
  fastify.post('/:id/trigger', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const { objective } = (request.body as any) || {};

    const squad = await prisma.squad.findUnique({
      where: { id, tenantId },
      include: { members: { include: { agent: { select: { id: true, name: true } } } } }
    });

    if (!squad) return reply.status(404).send({ error: 'Squad não encontrada' });

    const leaderMember = squad.members.find(m => m.role === 'leader') || squad.members[0];
    if (!leaderMember) return reply.status(400).send({ error: 'Squad sem líder definido. Adicione um líder no canvas.' });

    const objectiveText = objective?.trim() || `Executar missão da squad: ${squad.name}`;

    // Definição virtual: um único nó de execução da squad com squadId explícito
    const virtualDefinition = {
      nodes: [{
        id: 'squad-exec',
        type: 'squad',
        data: {
          squadId: id,
          label: squad.name,
          objective: objectiveText,
          leaderId: leaderMember.agentId,
        }
      }],
      edges: []
    };

    // Encontra ou cria um Workflow canônico para esta squad (sempre atualiza a definição)
    let workflow = await prisma.workflow.findFirst({
      where: { tenantId, name: `[Squad] ${squad.name}`, status: 'active' }
    });

    if (!workflow) {
      workflow = await prisma.workflow.create({
        data: {
          tenantId,
          name: `[Squad] ${squad.name}`,
          description: `Execução automática da squad ${squad.name}`,
          trigger: { type: 'manual', squadId: id },
          definition: virtualDefinition,
          status: 'active'
        }
      });
    } else {
      // Atualiza a definição para garantir squadId correto
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { definition: virtualDefinition }
      });
    }

    const run = await WorkflowRunnerService.triggerWorkflow(tenantId, workflow.id, {
      squadId: id,
      objective: objectiveText,
      type: 'squad_execution',
    });

    return reply.status(202).send({ runId: run.id, status: 'running', objective: objectiveText });
  });

  // Lista o que a squad aprendeu (memória semântica do líder)
  fastify.get('/:id/memory', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    const squad = await prisma.squad.findUnique({
      where: { id, tenantId },
      include: { members: { where: { role: 'leader' }, take: 1 } }
    });

    if (!squad) return reply.status(404).send({ error: 'Squad não encontrada' });

    const leaderMember = squad.members[0];
    if (!leaderMember) return reply.send({ memories: [], message: 'Squad sem líder definido.' });

    const memories = await KnowledgeService.listByAgent(leaderMember.agentId, tenantId);
    return reply.send({ memories, leaderId: leaderMember.agentId });
  });

  // Deleta uma squad
  fastify.delete('/:id', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    const squad = await prisma.squad.findUnique({ where: { id, tenantId } });
    if (!squad) return reply.status(404).send({ error: 'Squad não encontrada' });

    await prisma.squadMember.deleteMany({ where: { squadId: id } });
    await prisma.squad.delete({ where: { id } });

    return reply.send({ ok: true });
  });
}
