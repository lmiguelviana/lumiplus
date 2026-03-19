import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { settingsService } from '../services/settings.service.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

// Chaves que devem ser criptografadas (Secrets)
const SECRET_KEYS = [
  'openrouter_key',
  'openai_key',
  'anthropic_key',
  'gemini_key',
  'google_ai_key',
  'deepseek_key',
  'groq_key',
  'brave_search_key',
  'brevo_key',
  'meta_app_secret',
  'custom_ai_providers'
];

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // GET /v1/settings — frontend busca tudo aqui
  app.get('/', async (req, reply) => {
    const { tenantId } = req.user as { tenantId: string };
    const settings = await settingsService.list(tenantId);
    return reply.send({ settings });
  });

  // PUT /v1/settings/:key — salvar uma configuração
  app.put('/:key', async (req, reply) => {
    const paramsSchema = z.object({
      key: z.string(),
    });

    const bodySchema = z.object({
      value: z.string(),
    });

    try {
      const { key } = paramsSchema.parse(req.params);
      const { value } = bodySchema.parse(req.body);

      const { tenantId } = req.user as { tenantId: string };
      const isSecret = SECRET_KEYS.includes(key);
      await settingsService.set(tenantId, key, value, isSecret);

      return reply.send({ ok: true, key });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // GET /v1/settings/:key/reveal — revela o valor real de uma chave secreta
  app.get('/:key/reveal', async (req, reply) => {
    const { tenantId } = req.user as { tenantId: string };
    const { key } = z.object({ key: z.string() }).parse(req.params);
    const value = await settingsService.get(tenantId, key);
    
    if (!value) {
      return reply.status(404).send({ error: 'Chave não encontrada' });
    }

    return reply.send({ key, value });
  });

  // GET /v1/settings/ai/models — lista modelos disponíveis
  app.get('/ai/models', async (req, reply) => {
    try {
      // Por enquanto, lista os padrões globais e consulta o OpenRouter se houver chave
      const models = {
        openrouter: [] as any[],
        local: [] as any[],
        custom: [] as any[]
      };

      const { tenantId } = req.user as { tenantId: string };
      const orKey = await settingsService.get(tenantId, 'openrouter_key');
      
      if (orKey && !orKey.includes('undefined')) {
         try {
           const res = await fetch('https://openrouter.ai/api/v1/models', {
             headers: { 'Authorization': `Bearer ${orKey}` }
           });
           if(res.ok) {
              const data = await res.json() as any;
              models.openrouter = data.data.map((m: any) => ({
                id: m.id,
                name: m.name,
                context_length: m.context_length,
                pricing: m.pricing
              }));
           }
         } catch(e) { console.error("Falha ao buscar modelos openrouter", e) }
      } else {
        // Fallback hardcoded para demonstração se não houver internet/chave
        models.openrouter = [
          { id: 'openai/gpt-4o', name: 'GPT-4o (OpenAI)' },
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Anthropic)' },
          { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro (Google)' },
          { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Meta)' },
        ];
      }
      
      return reply.send({ models });
    } catch(err) {
      return reply.status(500).send({ error: 'Falha ao buscar lista de modelos' });
    }
  });

}
