import { prisma } from '../lib/prisma.js';


export class HistoryService {
  /**
   * Obtém ou cria uma conversa baseada no canal e ID externo
   */
  static async getOrCreateConversation(params: {
    tenantId: string;
    agentId: string;
    channel: string;
    externalId: string;
    metadata?: any;
  }) {
    const { tenantId, agentId, channel, externalId, metadata } = params;

    const conversation = await prisma.channelConversation.upsert({
      where: {
        tenantId_channel_externalId: {
          tenantId,
          channel,
          externalId,
        },
      },
      update: {
        updatedAt: new Date(),
        metadata: metadata ? { ...(metadata as any) } : undefined,
      },
      create: {
        tenantId,
        agentId,
        channel,
        externalId,
        metadata: metadata || {},
      },
    });

    return conversation;
  }

  /**
   * Adiciona uma mensagem ao histórico
   */
  static async addMessage(params: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: any;
  }) {
    const { conversationId, role, content, metadata } = params;

    return prisma.channelMessage.create({
      data: {
        conversationId,
        role,
        content,
        metadata: metadata || {},
      },
    });
  }

  /**
   * Recupera o contexto recente de uma conversa para enviar à IA
   */
  static async getRecentContext(conversationId: string, limit = 10) {
    const messages = await prisma.channelMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Invertemos para manter a ordem cronológica correta para a IA
    return messages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
  }
}
