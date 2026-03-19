import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { calculateCost } from '../utils/pricing.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';


export async function analyticsRoutes(fastify: FastifyInstance) {

  // Middleware de autenticação para todas as rotas de analytics
  fastify.addHook('preHandler', authMiddleware);

  // 1. Estatísticas Globais (Cards do Topo)
  fastify.get('/stats', async (request, reply) => {
    const { tenantId } = request.user as any;

    try {
      const stats = await prisma.agentInteraction.aggregate({
        where: { tenantId },
        _sum: {
          tokensUsed: true,
        },
        _avg: {
          latencyMs: true
        },
        _count: {
          id: true
        }
      });

      // Cálculo de custo total estimado (iterando nos últimos logs para precisão)
      const recentInteractions = await prisma.agentInteraction.findMany({
        where: { tenantId },
        select: { modelSelected: true, tokensUsed: true },
        take: 1000 // Limite para performance
      });

      const totalCost = recentInteractions.reduce((acc, curr) => {
        return acc + calculateCost(curr.modelSelected, curr.tokensUsed);
      }, 0);

      return {
        totalInteractions: stats._count.id || 0,
        totalTokens: stats._sum.tokensUsed || 0,
        avgLatency: Math.round(stats._avg.latencyMs || 0),
        estimatedCost: totalCost.toFixed(4)
      };
    } catch (error) {
      console.error('[Analytics] Erro ao calcular estatísticas:', error);
      return reply.status(500).send({ error: 'Erro ao calcular estatísticas' });
    }
  });

  // 2. Uso por Agente (Gráfico)
  fastify.get('/usage-by-agent', async (request, reply) => {
    const { tenantId } = request.user as any;

    try {
      const usage = await prisma.agentInteraction.groupBy({
        by: ['agentId'],
        where: { tenantId },
        _sum: {
          tokensUsed: true
        },
        _count: {
          id: true
        }
      });

      // Buscar nomes dos agentes para o gráfico
      const agents = await prisma.agent.findMany({
        where: { id: { in: usage.map(u => u.agentId) } },
        select: { id: true, name: true }
      });

      return usage.map(u => ({
        agentName: agents.find(a => a.id === u.agentId)?.name || 'Agente Removido',
        tokens: u._sum.tokensUsed || 0,
        requests: u._count.id
      }));
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao agrupar uso' });
    }
  });

  // 3. Logs de Interação Detalhados (Tabela do Nerve Center) — com paginação e filtros
  fastify.get('/interactions', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { agentId, status, page = '1', limit = '30', search, from, to } = request.query as any;

    const take = Math.min(parseInt(limit) || 30, 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const where: any = { tenantId };
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    try {
      const [interactions, total] = await Promise.all([
        prisma.agentInteraction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take,
          skip,
          include: { agent: { select: { name: true, slug: true } } }
        }),
        prisma.agentInteraction.count({ where })
      ]);

      return {
        data: interactions.map(i => ({
          ...i,
          estimatedCost: calculateCost(i.modelSelected, i.tokensUsed).toFixed(6)
        })),
        pagination: {
          page: Math.floor(skip / take) + 1,
          limit: take,
          total,
          totalPages: Math.ceil(total / take)
        }
      };
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar interações' });
    }
  });

  // 4. Time-Series para Gráfico (últimas 24h por hora OU últimos 7d por dia)
  fastify.get('/timeseries', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { period = '7d' } = request.query as any;

    try {
      const now = new Date();
      let since: Date;
      let truncExpr: string;
      let labelFormat: string;

      if (period === '24h') {
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        truncExpr = `date_trunc('hour', created_at)`;
        labelFormat = 'HH24:MI';
      } else {
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        truncExpr = `date_trunc('day', created_at)`;
        labelFormat = 'Dy';
      }

      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          ${truncExpr} as bucket,
          to_char(${truncExpr}, '${labelFormat}') as label,
          COUNT(*)::int as interactions,
          COALESCE(SUM(tokens_used), 0)::int as tokens,
          COALESCE(AVG(latency_ms), 0)::int as avg_latency
        FROM agent_interactions
        WHERE tenant_id = $1 AND created_at >= $2
        GROUP BY bucket, label
        ORDER BY bucket ASC
      `, tenantId, since);

      return rows.map(r => ({
        label: r.label,
        interactions: r.interactions,
        tokens: r.tokens,
        avgLatency: r.avg_latency
      }));
    } catch (error) {
      console.error('[Analytics] Erro timeseries:', error);
      return reply.status(500).send({ error: 'Erro ao gerar timeseries' });
    }
  });

  // 5. Status dos Sistemas Core (real-time check)
  fastify.get('/system-status', async (request, reply) => {
    const { tenantId } = request.user as any;

    try {
      // Verificar WhatsApp: buscar conversas ativas
      const waConversations = await prisma.channelConversation.count({
        where: { tenantId, channel: 'whatsapp', status: 'active' }
      });

      // Verificar Telegram
      const tgConversations = await prisma.channelConversation.count({
        where: { tenantId, channel: 'telegram', status: 'active' }
      });

      // OpenRouter: verificar se tem key configurada
      const orKey = await prisma.workspaceSetting.findFirst({
        where: { tenantId, key: 'openrouter_key' }
      });

      // PGVector: tentar contar knowledge items
      let knowledgeCount = 0;
      try {
        const kResult: any[] = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*)::int as c FROM knowledge_items WHERE tenant_id = $1`, tenantId
        );
        knowledgeCount = kResult[0]?.c || 0;
      } catch { /* table may not exist */ }

      // Recent interactions (últimos 5min) para checar se está "processing"
      const recentAI = await prisma.agentInteraction.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }
        }
      });

      return {
        whatsapp: { status: waConversations > 0 ? 'Active' : 'Standby', count: waConversations },
        telegram: { status: tgConversations > 0 ? 'Active' : 'Standby', count: tgConversations },
        openrouter: { status: recentAI > 0 ? 'Processing' : (orKey ? 'Active' : 'Offline'), configured: !!orKey },
        pgvector: { status: knowledgeCount > 0 ? 'Optimized' : 'Empty', count: knowledgeCount }
      };
    } catch (error) {
      console.error('[Analytics] Erro system-status:', error);
      return reply.status(500).send({ error: 'Erro' });
    }
  });
}
