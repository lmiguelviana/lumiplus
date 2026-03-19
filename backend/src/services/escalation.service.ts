import { prisma } from '../lib/prisma.js';


export class EscalationService {
  static async create(tenantId: string, agentId: string, contactId: string, reason: string, context: string) {
    console.log(`⚠️ [ESCALATION] Agente ${agentId} solicitou intervenção humana para ${contactId}. Motivo: ${reason}`);
    
    try {
      // 1. Criar registro de escalação no banco
      const escalation = await prisma.escalation.create({
        data: {
          tenantId,
          agentId,
          contactId,
          reason,
          context: { snippet: context },
          status: 'pending'
        }
      });

      // 2. Opcional: Notificar dono do tenant via WebSocket ou Canal Admin
      // Por enquanto, apenas logamos. No futuro, isso pode disparar um email ou push.
      
      return {
        success: true,
        message: 'A solicitação de ajuda humana foi registrada. Um atendente entrará em contato em breve.',
        escalationId: escalation.id
      };
    } catch (error) {
      console.error('❌ Erro ao criar escalação:', error);
      throw new Error('Falha ao registrar escalação humana.');
    }
  }
}
