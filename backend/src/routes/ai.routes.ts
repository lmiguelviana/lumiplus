import { FastifyInstance } from 'fastify';
import { AIService } from '../services/ai.service.js';
import { VisionService } from '../services/vision.service.js';
import { HistoryService } from '../services/history.service.js';
import { ButtonParserService } from '../services/button-parser.service.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { prisma } from '../lib/prisma.js';


export async function aiRoutes(server: FastifyInstance) {

  // Rota protegida para chat com o Agente (persiste no histórico com isolamento por conversa)
  server.post('/chat', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const { messages, models, agentId, conversationId } = request.body as any;
    const { tenantId, userId } = request.user as { tenantId: string; userId?: string };

    if (!messages || !Array.isArray(messages)) {
      return reply.status(400).send({ error: 'Messages array is required' });
    }

    if (!agentId) {
      return reply.status(400).send({ error: 'Agent ID is required for context-aware chat' });
    }

    // Auto-cria uma conversa para garantir persistência desde a 1ª mensagem
    let convId = conversationId;
    if (!convId) {
      const newConv = await HistoryService.getOrCreateConversation({
        tenantId,
        agentId,
        channel: 'web',
        externalId: `web_${userId || 'anon'}_${Date.now()}`,
      });
      convId = newConv.id;
    }

    // Persiste a última mensagem do usuário
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === 'user') {
      await HistoryService.addMessage({ conversationId: convId, role: 'user', content: lastUserMsg.content });
    }

    const response = await AIService.complete(tenantId, agentId, messages, models, 'web');

    // Parsear botões na resposta
    const parsed = ButtonParserService.parse(response.content);

    // Salvar resposta no histórico
    if (response.content) {
      await HistoryService.addMessage({ conversationId: convId, role: 'assistant', content: response.content });
    }

    return {
      ...response,
      conversationId: convId, // Retorna para o frontend associar mensagens futuras
      buttons: parsed.hasButtons ? ButtonParserService.toWebChat(parsed) : undefined,
      text: parsed.hasButtons ? parsed.text : undefined,
    };
  });

  // Lista conversas de um agente (web + whatsapp + telegram)
  server.get('/conversations/:agentId', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { agentId } = request.params as { agentId: string };

    const conversations = await prisma.channelConversation.findMany({
      where: { tenantId, agentId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Só última mensagem para preview
          select: { content: true, role: true, createdAt: true }
        }
      }
    });

    return conversations.map(c => ({
      id: c.id,
      channel: c.channel,
      externalId: c.externalId,
      lastMessage: c.messages[0]?.content?.slice(0, 100) || '',
      lastRole: c.messages[0]?.role || '',
      lastAt: c.messages[0]?.createdAt || c.updatedAt,
      status: c.status,
    }));
  });

  // Cria nova conversa web
  server.post('/conversations/:agentId', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const { tenantId, userId } = request.user as { tenantId: string; userId?: string };
    const { agentId } = request.params as { agentId: string };

    const conversation = await HistoryService.getOrCreateConversation({
      tenantId,
      agentId,
      channel: 'web',
      externalId: `web_${userId || 'anon'}_${Date.now()}`,
    });

    return conversation;
  });

  // Carrega mensagens de uma conversa
  server.get('/conversations/:agentId/:conversationId/messages', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { agentId, conversationId } = request.params as { agentId: string; conversationId: string };

    // Verifica que a conversa pertence ao tenant
    const conv = await prisma.channelConversation.findFirst({
      where: { id: conversationId, tenantId, agentId }
    });
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' });

    const messages = await prisma.channelMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return messages.map(m => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
  });

  // Rota para avaliar interação (👍/👎)
  server.patch('/interactions/:id/rating', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { rating } = request.body as { rating: 'positive' | 'negative' };

    if (!['positive', 'negative'].includes(rating)) {
      return reply.status(400).send({ error: 'rating deve ser "positive" ou "negative"' });
    }

    try {
      await prisma.$executeRaw`UPDATE agent_interactions SET rating = ${rating} WHERE id = ${id} AND tenant_id = ${tenantId}`;
      return reply.send({ ok: true });
    } catch {
      return reply.status(404).send({ error: 'Interação não encontrada' });
    }
  });

  // Rota para análise de imagem (Vision)
  server.post('/vision', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const { imageBase64, mimeType } = request.body as any;
    
    if (!imageBase64) {
      return reply.status(400).send({ error: 'Image Base64 is required' });
    }

    const { tenantId } = request.user as { tenantId: string };
    const buffer = Buffer.from(imageBase64, 'base64');
    const description = await VisionService.analyze(tenantId, buffer, mimeType || 'image/jpeg');
    
    return { description };
  });

  // Transcrição de áudio via Groq Whisper
  server.post('/transcribe', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const { audio } = request.body as { audio: string };
    const { tenantId } = request.user as { tenantId: string };

    if (!audio) return reply.status(400).send({ error: 'Audio base64 é obrigatório' });

    // Buscar chave Groq
    const { settingsService } = await import('../services/settings.service.js');
    const groqKey = await settingsService.get(tenantId, 'groq_key');
    if (!groqKey) {
      return reply.status(400).send({ error: 'Chave Groq não configurada. Vá em Config → Groq API Key.' });
    }

    try {
      const audioBuffer = Buffer.from(audio, 'base64');

      // Groq Whisper API — precisa de multipart via Blob nativo do Node 18+
      const blob = new Blob([audioBuffer], { type: 'audio/webm' });
      const formData = new FormData();
      formData.set('file', blob, 'audio.webm');
      formData.set('model', 'whisper-large-v3');
      formData.set('language', 'pt');
      formData.set('response_format', 'json');

      console.log(`[Transcribe] Enviando ${audioBuffer.length} bytes para Groq Whisper...`);

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Transcribe] Groq ${res.status}: ${errText.slice(0, 300)}`);
        return reply.status(500).send({ error: `Groq erro ${res.status}: ${errText.slice(0, 100)}` });
      }

      const data = await res.json();
      console.log(`[Transcribe] ✅ Transcrito: "${(data.text || '').slice(0, 50)}..."`);
      return { text: data.text || '' };
    } catch (err: any) {
      console.error('[Transcribe] Erro:', err.message);
      return reply.status(500).send({ error: `Erro: ${err.message}` });
    }
  });
}
