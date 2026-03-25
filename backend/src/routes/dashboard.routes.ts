import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';


export async function dashboardRoutes(server: FastifyInstance) {
  
  // Middleware de Autenticação para todas as rotas do dashboard
  server.addHook('preHandler', authMiddleware);

  /**
   * GET /v1/dashboard/stats
   * Retorna estatísticas gerais para a home
   */
  server.get('/stats', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };

    const totalInteractions = await prisma.agentInteraction.count({ where: { tenantId } });
    const activeAgents = await prisma.agent.count({ where: { tenantId } });
    const totalTokens = await prisma.agentInteraction.aggregate({
      where: { tenantId },
      _sum: { tokensUsed: true }
    });

    return {
      totalInteractions,
      activeAgents,
      totalTokens: totalTokens._sum.tokensUsed || 0,
    };
  });

  /**
   * GET /v1/dashboard/agents
   * Lista agentes do tenant
   */
  server.get('/agents', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const agents = await prisma.agent.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { interactions: true }
        }
      }
    });

    // Buscar chaves de API do tenant para determinar status global/agente
    const tenantKeys = await prisma.agentApiKey.findMany({
      where: { tenantId },
      select: { provider: true, agentId: true }
    });

    return agents.map(a => {
      const agentKeys = tenantKeys.filter(k => k.agentId === a.id || k.agentId === null);
      
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        mission: a.mission,
        model: a.primaryModel,
        fallbackModels: a.fallbackModels,
        economyMode: a.economyMode,
        status: 'online', 
        interactions: a._count.interactions,
        channels: {
          whatsapp: { status: 'active' }, // Ativo por padrão
          telegram: { status: agentKeys.some(k => k.provider === 'telegram') ? 'active' : 'inactive' },
          discord: { status: agentKeys.some(k => k.provider === 'discord') ? 'active' : 'inactive' }
        }
      };
    });
  });

  /**
   * GET /v1/dashboard/logs
   * Lista interações recentes
   */
  server.get('/logs', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const logs = await prisma.agentInteraction.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        agent: { select: { name: true } }
      }
    });

    return logs.map(l => ({
      id: l.id,
      agentName: l.agent?.name || 'Agente Removido',
      input: typeof l.input === 'string' ? l.input : JSON.stringify(l.input),
      output: typeof l.output === 'string' ? l.output : (l.output as any)?.content || JSON.stringify(l.output),
      tokens: l.tokensUsed,
      latency: `${(l.latencyMs / 1000).toFixed(1)}s`,
      timestamp: l.createdAt.toISOString(),
      channel: 'api' // Por enquanto focado em API
    }));
  });

  /**
   * PATCH /v1/dashboard/agents/:id
   * Atualiza configurações de um agente.
   */
  server.patch('/agents/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as any;

    // Filtra apenas campos válidos do model Agent
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.mission !== undefined) updateData.mission = body.mission;
    if (body.systemPrompt !== undefined) updateData.systemPrompt = body.systemPrompt;
    if (body.primaryProvider !== undefined) updateData.primaryProvider = body.primaryProvider;
    if (body.primaryModel !== undefined) updateData.primaryModel = body.primaryModel;
    if (body.fallbackModels !== undefined) updateData.fallbackModels = body.fallbackModels;
    if (body.fallbackConfig !== undefined) updateData.fallbackConfig = body.fallbackConfig;
    if (body.economyMode !== undefined) updateData.economyMode = body.economyMode;
    if (body.tone !== undefined) updateData.tone = body.tone;
    if (body.personality !== undefined) updateData.personality = body.personality;
    // Fase 28: Grupos
    if (body.groupEnabled !== undefined) updateData.groupEnabled = body.groupEnabled;
    if (body.groupActivation !== undefined) updateData.groupActivation = body.groupActivation;
    if (body.groupMentionPatterns !== undefined) updateData.groupMentionPatterns = body.groupMentionPatterns;
    if (body.groupKeywords !== undefined) updateData.groupKeywords = body.groupKeywords;
    if (body.groupCooldown !== undefined) updateData.groupCooldown = body.groupCooldown;
    if (body.groupHistoryLimit !== undefined) updateData.groupHistoryLimit = body.groupHistoryLimit;
    // Fase 29: Controle de Acesso
    if (body.accessMode !== undefined) updateData.accessMode = body.accessMode;
    if (body.accessAllowlist !== undefined) updateData.accessAllowlist = body.accessAllowlist;
    if (body.accessBlocklist !== undefined) updateData.accessBlocklist = body.accessBlocklist;

    try {
      // Verifica que o agente pertence ao tenant
      const existing = await prisma.agent.findFirst({ where: { id, tenantId } });
      if (!existing) return reply.code(404).send({ error: 'Agente não encontrado.' });

      const agent = await prisma.agent.update({
        where: { id },
        data: updateData
      });

      return agent;
    } catch (error: any) {
      console.error('Erro ao atualizar agente:', error?.message, error);
      return reply.code(500).send({ error: 'Erro ao atualizar: ' + (error?.message || 'desconhecido') });
    }
  });

  /**
   * POST /v1/dashboard/agents
   * Cria um novo agente para o tenant.
   */
  server.post('/agents', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { name, mission, model } = request.body as any;
    
    // Gerar slug amigável
    const slug = name.toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    try {
      const agent = await prisma.agent.create({
        data: {
          tenantId,
          name,
          slug,
          mission,
          primaryModel: model || 'google/gemini-2.0-flash-001',
          systemPrompt: mission,
          tone: 'Profissional e prestativo',
          personality: 'Assistente virtual Lumi Plus',
          status: 'active'
        }
      });

      // Auto-criar squad padrão do agente
      const { SkillRegistry } = await import('../services/skills/registry.js');
      await SkillRegistry.activateDefaults(tenantId, agent.id).catch(e => {
        console.warn('[Dashboard] Falha ao ativar skills padrao:', e.message);
      });
      const { AgentSquadService } = await import('../services/agent-squad.service.js');
      await AgentSquadService.createDefaultSquad(tenantId, agent.id, agent.name).catch(e => {
        console.warn('[Dashboard] Falha ao criar squad padrão:', e.message);
      });

      return {
        ...agent,
        primaryModel: agent.primaryModel,
        fallbackModels: agent.fallbackModels,
        economyMode: agent.economyMode
      };
    } catch (error) {
      console.error('Erro ao criar agente:', error);
      return reply.code(500).send({ error: 'Falha ao processar criação do núcleo de inteligência.' });
    }
  });

  // ── Templates de Agente (Fase 34) ──

  server.get('/agent-templates', async () => {
    const { AGENT_TEMPLATES } = await import('../services/agent-templates.js');
    return { templates: AGENT_TEMPLATES };
  });

  server.post('/agents/from-template', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { templateId, name } = request.body as any;

    const { AGENT_TEMPLATES } = await import('../services/agent-templates.js');
    const template = AGENT_TEMPLATES.find(t => t.id === templateId);
    if (!template) return reply.code(404).send({ error: 'Template não encontrado' });

    const agentName = name || template.name;
    const slug = agentName.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');

    const agent = await prisma.agent.create({
      data: {
        tenantId, name: agentName, slug,
        mission: template.config.mission,
        tone: template.config.tone,
        personality: template.config.personality,
        systemPrompt: template.config.systemPrompt,
        primaryModel: template.config.primaryModel,
        economyMode: template.config.economyMode,
        status: 'active',
      },
    });

    // Ativar skills do template
    const { SkillRegistry } = await import('../services/skills/registry.js');
    await SkillRegistry.activateDefaults(tenantId, agent.id).catch(() => {});
    for (const skillId of template.skills) {
      await SkillRegistry.activate(tenantId, agent.id, skillId).catch(() => {});
    }

    // Auto-criar squad padrão do agente
    const { AgentSquadService } = await import('../services/agent-squad.service.js');
    await AgentSquadService.createDefaultSquad(tenantId, agent.id, agent.name).catch(e => {
      console.warn('[Dashboard] Falha ao criar squad padrão (template):', e.message);
    });

    return agent;
  });

  // ── Export/Import de Agente (Fase 34) ──

  server.get('/agents/:id/export', async (request) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as any;

    const agent = await prisma.agent.findFirst({ where: { id, tenantId } });
    if (!agent) return { error: 'Agente não encontrado' };

    const skills = await prisma.agentSkill.findMany({ where: { agentId: id, tenantId, enabled: true } });
    const knowledge = await prisma.agentKnowledge.findMany({
      where: { agentId: id, tenantId },
      select: { title: true, content: true },
      take: 50,
    });
    const cronJobs = await prisma.agentCronJob.findMany({
      where: { agentId: id, tenantId },
      select: { name: true, schedule: true, prompt: true, timezone: true, enabled: true },
    });

    return {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      agent: {
        name: agent.name, mission: agent.mission, systemPrompt: agent.systemPrompt,
        tone: agent.tone, personality: agent.personality,
        primaryModel: agent.primaryModel, economyMode: agent.economyMode,
        groupEnabled: agent.groupEnabled, groupActivation: agent.groupActivation,
        accessMode: agent.accessMode,
      },
      skills: skills.map(s => s.skillId),
      knowledge: knowledge.map(k => ({ title: k.title, content: k.content })),
      cronJobs,
    };
  });

  server.post('/agents/import', async (request) => {
    const { tenantId } = request.user as any;
    const data = request.body as any;

    if (!data?.agent?.name) return { error: 'Formato inválido' };

    const slug = data.agent.name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-') + '-' + Date.now().toString(36);

    const agent = await prisma.agent.create({
      data: {
        tenantId, slug, status: 'active',
        name: data.agent.name, mission: data.agent.mission, systemPrompt: data.agent.systemPrompt,
        tone: data.agent.tone, personality: data.agent.personality,
        primaryModel: data.agent.primaryModel || 'google/gemini-2.0-flash-001',
        economyMode: data.agent.economyMode || false,
      },
    });

    // Skills
    const { SkillRegistry } = await import('../services/skills/registry.js');
    await SkillRegistry.activateDefaults(tenantId, agent.id).catch(() => {});
    for (const skillId of (data.skills || [])) {
      await SkillRegistry.activate(tenantId, agent.id, skillId).catch(() => {});
    }

    // Knowledge
    const { KnowledgeService } = await import('../services/knowledge.service.js');
    for (const k of (data.knowledge || [])) {
      await KnowledgeService.save(tenantId, agent.id, { title: k.title, content: k.content }).catch(() => {});
    }

    // Auto-criar squad padrão do agente
    const { AgentSquadService } = await import('../services/agent-squad.service.js');
    await AgentSquadService.createDefaultSquad(tenantId, agent.id, agent.name).catch(e => {
      console.warn('[Dashboard] Falha ao criar squad padrão (import):', e.message);
    });

    return { agent, imported: { skills: data.skills?.length || 0, knowledge: data.knowledge?.length || 0 } };
  });

  // ── Notificações (Fase 34) ──

  server.get('/notifications', async (request) => {
    const { tenantId } = request.user as any;

    const [pendingAccess, pendingApprovals, failedRuns] = await Promise.all([
      prisma.accessRequest.count({ where: { tenantId, status: 'pending' } }),
      prisma.humanApproval.count({ where: { tenantId, status: 'pending' } }),
      prisma.workflowRun.count({ where: { workflow: { tenantId }, status: 'failed', endedAt: { gte: new Date(Date.now() - 86400000) } } }),
    ]);

    const total = pendingAccess + pendingApprovals + failedRuns;

    return {
      total,
      items: [
        ...(pendingAccess > 0 ? [{ type: 'access', count: pendingAccess, label: `${pendingAccess} pedido(s) de acesso`, link: '/agents' }] : []),
        ...(pendingApprovals > 0 ? [{ type: 'approval', count: pendingApprovals, label: `${pendingApprovals} aprovação(ões) pendente(s)`, link: '/workflows' }] : []),
        ...(failedRuns > 0 ? [{ type: 'error', count: failedRuns, label: `${failedRuns} workflow(s) com erro (24h)`, link: '/logs' }] : []),
      ],
    };
  });

  /**
   * GET /v1/dashboard/agents/:id/skills
   * Lista as skills ativas de um agente.
   */
  server.get('/agents/:id/skills', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const skills = await prisma.agentSkill.findMany({ where: { agentId: id, tenantId } });
    return reply.send({ skills });
  });

  /**
   * PUT /v1/dashboard/agents/:id/skills
   * Upsert lista de skills do agente.
   * Body: { skills: [{ skillId: string, enabled: boolean, config?: object }] }
   */
  server.put('/agents/:id/skills', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { skills } = request.body as { skills: { skillId: string; enabled: boolean; config?: any }[] };

    if (!Array.isArray(skills)) return reply.status(400).send({ error: 'skills deve ser um array' });

    for (const s of skills) {
      const existing = await prisma.agentSkill.findFirst({ where: { agentId: id, skillId: s.skillId, tenantId } });
      if (existing) {
        await prisma.agentSkill.update({ where: { id: existing.id }, data: { enabled: s.enabled, config: s.config ?? {} } });
      } else {
        await prisma.agentSkill.create({ data: { tenantId, agentId: id, skillId: s.skillId, enabled: s.enabled, config: s.config ?? {} } });
      }
    }

    const updated = await prisma.agentSkill.findMany({ where: { agentId: id, tenantId } });
    return reply.send({ skills: updated });
  });

  /**
   * GET /v1/dashboard/agents/:id/soul
   * Retorna o systemPrompt (SOUL) do agente.
   */
  server.get('/agents/:id/soul', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const agent = await prisma.agent.findUnique({ where: { id, tenantId }, select: { systemPrompt: true, mission: true } });
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' });
    return reply.send({ soul: agent.systemPrompt || agent.mission || '' });
  });

  /**
   * PUT /v1/dashboard/agents/:id/soul
   * Salva o SOUL.md (systemPrompt) do agente.
   */
  server.put('/agents/:id/soul', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { soul } = request.body as { soul: string };
    await prisma.agent.update({ where: { id, tenantId }, data: { systemPrompt: soul } });
    return reply.send({ ok: true });
  });

  // ── Fase 29: Access Requests ──

  server.get('/access-requests', async (request) => {
    const { tenantId } = request.user as any;
    const { agentId } = request.query as any;
    const { AccessControlService } = await import('../services/access-control.service.js');
    return AccessControlService.getPendingRequests(tenantId, agentId);
  });

  server.post('/access-requests/:id/approve', async (request) => {
    const { id } = request.params as any;
    const req = await prisma.accessRequest.findUnique({ where: { id } });
    if (!req) return { error: 'Não encontrado' };
    const { AccessControlService } = await import('../services/access-control.service.js');
    return AccessControlService.approveAccess(req.agentId, req.senderId);
  });

  server.post('/access-requests/:id/reject', async (request) => {
    const { id } = request.params as any;
    const req = await prisma.accessRequest.findUnique({ where: { id } });
    if (!req) return { error: 'Não encontrado' };
    const { AccessControlService } = await import('../services/access-control.service.js');
    return AccessControlService.rejectAccess(req.agentId, req.senderId);
  });
}
