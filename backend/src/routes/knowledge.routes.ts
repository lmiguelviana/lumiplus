import { FastifyInstance } from 'fastify';
import { KnowledgeService } from '../services/knowledge.service.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { z } from 'zod';

export async function knowledgeRoutes(fastify: FastifyInstance) {

  // Middleware de autenticação para todas as rotas de knowledge
  fastify.addHook('preHandler', authMiddleware);

  // Listar fragmentos por agente
  fastify.get('/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const { tenantId } = request.user as any;

    try {
      const results = await KnowledgeService.listByAgent(agentId, tenantId);
      return results;
    } catch (error: any) {
      console.error('❌ [KNOWLEDGE_LIST] Erro:', error.message);
      return reply.status(500).send({ error: 'Erro ao listar conhecimento', details: error.message });
    }
  });

  // Adicionar novo conhecimento (Texto/URL)
  fastify.post('/:agentId/upload', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const { tenantId } = request.user as any;
    
    const schema = z.object({
      content: z.string().min(3),
      title: z.string().optional()
    });

    try {
      const { content, title } = schema.parse(request.body);
      await KnowledgeService.add(tenantId, agentId, content, title);
      return { success: true, message: 'Conhecimento processado e armazenado' };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.issues });
      }
      console.error('❌ [KNOWLEDGE_UPLOAD] Erro ao processar conhecimento:', error.message);
      return reply.status(500).send({ error: 'Erro ao processar conhecimento', details: error.message });
    }
  });

  // Buscar SOUL.md atual do agente
  fastify.get('/:agentId/soul', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const { tenantId } = request.user as any;
    const soul = await KnowledgeService.getSoul(tenantId, agentId);
    return reply.send({ soul });
  });

  // Salvar (upsert) SOUL.md do agente
  fastify.post('/:agentId/soul', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const { tenantId } = request.user as any;
    const { content } = request.body as { content: string };

    if (!content?.trim()) {
      return reply.status(400).send({ error: 'content é obrigatório' });
    }

    await KnowledgeService.setSoul(tenantId, agentId, content.trim());
    return reply.send({ ok: true });
  });

  // Deletar fragmento
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.user as any;

    try {
      await KnowledgeService.delete(id, tenantId);
      return { success: true };
    } catch (error: any) {
      console.error('\n\n\n🚨🚨🚨 [KNOWLEDGE_DELETE] ERRO PRISMA:', error, '\n\n\n');
      console.error('❌ [KNOWLEDGE_DELETE] Erro:', error.message);
      return reply.status(500).send({ error: 'Erro ao deletar fragmento', details: error.message });
    }
  });

  // Editar fragmento
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.user as any;
    
    const schema = z.object({
      content: z.string().min(3),
      title: z.string().optional()
    });

    try {
      const { content, title } = schema.parse(request.body);
      await KnowledgeService.update(id, tenantId, content, title);
      return { success: true, message: 'Fragmento atualizado com sucesso' };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.issues });
      }
      console.error('\n\n\n🚨🚨🚨 [KNOWLEDGE_UPDATE] ERRO PRISMA:', error, '\n\n\n');
      console.error('❌ [KNOWLEDGE_UPDATE] Erro:', error.message);
      return reply.status(500).send({ error: 'Erro ao atualizar fragmento', details: error.message });
    }
  });
}
