import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { SKILL_CATALOG } from '../services/skills/catalog.js';
import { SkillRegistry } from '../services/skills/registry.js';
import { logger } from '../lib/logger.js';

export async function skillsRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  /** GET /skills/catalog — catálogo completo de skills */
  server.get('/catalog', async (request, reply) => {
    const { tenantId } = request.user as any;
    try {
      const activeSkills = await prisma.agentSkill.findMany({
        where: { tenantId, enabled: true },
        select: { agentId: true, skillId: true },
      });

      const catalog = Object.values(SKILL_CATALOG).map(skill => ({
        ...skill,
        tool: undefined,
        systemPromptAddition: undefined,
        activeAgents: activeSkills.filter(s => s.skillId === skill.id).map(s => s.agentId),
      }));

      return { catalog };
    } catch (err: any) {
      logger.error('SkillsRoutes', 'Erro ao buscar catálogo', err.message);
      return reply.status(500).send({ error: err.message, code: 'CATALOG_ERROR' });
    }
  });

  /** GET /skills/agent/:agentId — skills de um agente específico */
  server.get('/agent/:agentId', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { agentId } = request.params as any;
    try {
      const skills = await prisma.agentSkill.findMany({
        where: { tenantId, agentId },
      });

      const enriched = skills.map(s => ({
        ...s,
        catalogInfo: SKILL_CATALOG[s.skillId] ? {
          name: SKILL_CATALOG[s.skillId].name,
          description: SKILL_CATALOG[s.skillId].description,
          icon: SKILL_CATALOG[s.skillId].icon,
          category: SKILL_CATALOG[s.skillId].category,
          credentials: SKILL_CATALOG[s.skillId].credentials,
        } : null,
      }));

      return { skills: enriched };
    } catch (err: any) {
      logger.error('SkillsRoutes', `Erro ao buscar skills do agente ${agentId}`, err.message);
      return reply.status(500).send({ error: err.message, code: 'AGENT_SKILLS_ERROR' });
    }
  });

  /** POST /skills/agent/:agentId/activate — ativa skill para agente */
  server.post('/agent/:agentId/activate', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { agentId } = request.params as any;
    const { skillId, config } = request.body as any;
    try {
      const result = await SkillRegistry.activate(tenantId, agentId, skillId, config || {});
      logger.success('SkillsRoutes', `Skill ${skillId} ativada para agente ${agentId}`);
      return { success: true, skill: result };
    } catch (err: any) {
      logger.error('SkillsRoutes', `Erro ao ativar skill ${skillId}`, err.message);
      return reply.status(400).send({ error: err.message, code: 'ACTIVATE_ERROR' });
    }
  });

  /** POST /skills/agent/:agentId/deactivate — desativa skill */
  server.post('/agent/:agentId/deactivate', async (request, reply) => {
    const { agentId } = request.params as any;
    const { skillId } = request.body as any;
    try {
      await SkillRegistry.deactivate(agentId, skillId);
      logger.info('SkillsRoutes', `Skill ${skillId} desativada para agente ${agentId}`);
      return { success: true };
    } catch (err: any) {
      logger.error('SkillsRoutes', `Erro ao desativar skill ${skillId}`, err.message);
      return reply.status(500).send({ error: err.message, code: 'DEACTIVATE_ERROR' });
    }
  });

  /** GET /skills/custom — skills personalizadas (APIs auto-configuradas pelos agentes) */
  server.get('/custom', async (request, reply) => {
    const { tenantId } = request.user as any;
    try {
      const customSkills = await prisma.agentSkill.findMany({
        where: {
          tenantId,
          enabled: true,
          skillId: { startsWith: 'custom:' },
        },
        include: {
          agent: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Agrupa por skillId para mostrar quais agentes têm cada API
      const grouped: Record<string, any> = {};
      for (const s of customSkills) {
        if (!grouped[s.skillId]) {
          const config = s.config as any;
          grouped[s.skillId] = {
            skillId: s.skillId,
            apiName: config?.apiName || s.skillId.replace('custom:', ''),
            credentialKey: config?.credentialKey || s.skillId.replace('custom:', ''),
            agents: [],
            createdAt: s.createdAt,
          };
        }
        grouped[s.skillId].agents.push({
          id: s.agent.id,
          name: s.agent.name,
          slug: s.agent.slug,
        });
      }

      return { customSkills: Object.values(grouped) };
    } catch (err: any) {
      logger.error('SkillsRoutes', 'Erro ao buscar custom skills', err.message);
      return reply.status(500).send({ error: err.message, code: 'CUSTOM_SKILLS_ERROR' });
    }
  });

  /** DELETE /skills/custom/:skillId/agent/:agentId — remove custom skill de um agente */
  server.delete('/custom/:skillId/agent/:agentId', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { skillId, agentId } = request.params as any;
    try {
      await prisma.agentSkill.deleteMany({
        where: { tenantId, agentId, skillId: `custom:${skillId}` },
      });
      return { success: true };
    } catch (err: any) {
      logger.error('SkillsRoutes', 'Erro ao remover custom skill', err.message);
      return reply.status(500).send({ error: err.message, code: 'REMOVE_CUSTOM_ERROR' });
    }
  });

  /** POST /skills/agent/:agentId/defaults — ativa skills padrão */
  server.post('/agent/:agentId/defaults', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { agentId } = request.params as any;
    try {
      await SkillRegistry.activateDefaults(tenantId, agentId);
      return { success: true };
    } catch (err: any) {
      logger.error('SkillsRoutes', `Erro ao ativar defaults para ${agentId}`, err.message);
      return reply.status(500).send({ error: err.message, code: 'DEFAULTS_ERROR' });
    }
  });
}
