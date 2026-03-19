import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { getOrCreateDefaultTenantId } from '../lib/default-tenant.js';

/**
 * Middleware para extração de contexto de Tenant e verificação JWT.
 * Garante que cada requisição esteja isolada em seu próprio namespace de dados.
 * Em desenvolvimento: usa TEST_TENANT_ID do .env ou obtém/cria o tenant padrão (slug 'default').
 */

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Tenta verificar JWT primeiro (funciona em dev e prod se token presente)
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      await request.jwtVerify();
      const user = request.user as any;
      const tenantId = user.tenantId || user.tenant_id;
      if (!tenantId) {
        return reply.status(401).send({ error: 'Tenant context missing in token' });
      }
      request.user = { ...user, tenantId };
      return;
    }

    // 🚧 BYPASS PARA DESENVOLVIMENTO (sem token) — usa tenant padrão
    if (env.NODE_ENV === 'development') {
      const tenantId = env.TEST_TENANT_ID || await getOrCreateDefaultTenantId();
      request.user = { tenantId };
      return;
    }

    // Produção sem token → 401
    return reply.status(401).send({ error: 'Authorization header missing' });

  } catch (err: any) {
    reply.status(401).send({ error: 'Token inválido', details: err.message });
  }
}
