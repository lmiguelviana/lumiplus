import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { encrypt } from '../utils/vault.js';
import { env } from '../config/env.js';


/**
 * Rotas de Configuração Global e BYOK (Bring Your Own Key).
 * @backend-specialist Principle: Security first, modularity second.
 */
export async function configRoutes(server: FastifyInstance) {
  
  server.addHook('preHandler', authMiddleware);

  /**
   * GET /v1/config/keys
   * Lista quais provedores têm chaves configuradas (sem expor a chave).
   */
  server.get('/keys', async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    
    const keys = await prisma.agentApiKey.findMany({
      where: { tenantId },
      select: { provider: true, createdAt: true, agentId: true }
    });

    return keys;
  });

  /**
   * POST /v1/config/keys
   * Salva uma chave de API criptografada para o tenant ou agente específico.
   */
  server.post('/keys', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { provider, key, agentId } = request.body as { provider: string, key: string, agentId?: string };

    if (!provider || !key) {
      return reply.code(400).send({ error: 'Provedor e chave são obrigatórios.' });
    }

    const { encrypted, iv } = encrypt(key, env.VAULT_MASTER_KEY);

    // Upsert baseado em Tenant + Provedor + Agente (agente pode ser null)
    const existingKey = await prisma.agentApiKey.findFirst({
      where: { tenantId, provider, agentId: agentId || null }
    });

    if (existingKey) {
      await prisma.agentApiKey.update({
        where: { id: existingKey.id },
        data: { keyEncrypted: encrypted, keyIv: iv }
      });
    } else {
      await prisma.agentApiKey.create({
        data: {
          tenantId,
          agentId: agentId || null,
          provider,
          keyEncrypted: encrypted,
          keyIv: iv
        }
      });
    }

    return { status: 'success', message: `Chave para ${provider} (${agentId ? 'Agente' : 'Workspace'}) salva com sucesso.` };
  });

  /**
   * GET /v1/config/channels
   * Retorna o status de ativação dos canais verificando DB e ENV.
   */
  server.get('/channels', async (request) => {
    const { tenantId } = request.user as { tenantId: string };

    const dbKeys = await prisma.agentApiKey.findMany({
      where: { tenantId },
      select: { provider: true }
    });

    const activeProviders = new Set(dbKeys.map(k => k.provider));

    return {
      whatsapp: { status: 'active', platform: 'Baileys' },
      telegram: { status: (activeProviders.has('telegram') || !!env.TELEGRAM_BOT_TOKEN) ? 'active' : 'inactive' },
      discord: { status: (activeProviders.has('discord') || !!env.DISCORD_BOT_TOKEN) ? 'active' : 'inactive' }
    };
  });
}
