/**
 * AccessControlService — Fase 28 (Grupos) + Fase 29 (Allowlist)
 * Verifica se um remetente pode interagir e se o bot deve responder em grupos.
 */

import { prisma } from '../lib/prisma.js';

type AccessResult = 'allowed' | 'blocked' | 'pending';

interface GroupCheckParams {
  text: string;
  isGroup: boolean;
  agentName: string;
  botJid?: string;
  quotedParticipant?: string;
}

export class AccessControlService {

  /** Verifica se o remetente tem acesso ao agente */
  static async checkAccess(agentId: string, senderId: string, channel: string): Promise<AccessResult> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { tenantId: true, accessMode: true, accessAllowlist: true, accessBlocklist: true },
    });
    if (!agent) return 'blocked';

    // 1. Blocklist sempre tem prioridade
    if (agent.accessBlocklist.includes(senderId)) return 'blocked';

    // 2. Modo open → sempre permitido
    if (agent.accessMode === 'open') return 'allowed';

    // 3. Modo disabled → sempre bloqueado
    if (agent.accessMode === 'disabled') return 'blocked';

    // 4. Modo allowlist → verifica lista
    if (agent.accessMode === 'allowlist') {
      return agent.accessAllowlist.includes(senderId) ? 'allowed' : 'blocked';
    }

    // 5. Modo pairing → cria request se não aprovado
    if (agent.accessMode === 'pairing') {
      const existing = await prisma.accessRequest.findUnique({
        where: { agentId_senderId: { agentId, senderId } },
      });
      if (existing?.status === 'approved') return 'allowed';
      if (existing?.status === 'rejected') return 'blocked';

      // Cria pedido de acesso
      if (!existing) {
        await prisma.accessRequest.create({
          data: { tenantId: agent.tenantId, agentId, senderId, channel, status: 'pending' },
        });
      }
      return 'pending';
    }

    return 'allowed';
  }

  /** Verifica se o bot deve responder numa mensagem de grupo */
  static shouldRespondInGroup(agent: any, params: GroupCheckParams): boolean {
    if (!params.isGroup) return true; // DM → sempre responde
    if (!agent.groupEnabled) return false; // Grupos desativados

    const text = params.text.toLowerCase();
    const mode = agent.groupActivation || 'mention';

    if (mode === 'always') return true;

    if (mode === 'mention') {
      const patterns = [
        agent.name?.toLowerCase(),
        `@${agent.slug}`,
        ...(agent.groupMentionPatterns || []).map((p: string) => p.toLowerCase()),
      ].filter(Boolean);
      return patterns.some(p => text.includes(p));
    }

    if (mode === 'keyword') {
      return (agent.groupKeywords || []).some((k: string) => text.toLowerCase().includes(k.toLowerCase()));
    }

    if (mode === 'reply') {
      return params.quotedParticipant === params.botJid;
    }

    return false;
  }

  /**
   * Cooldown anti-spam armazenado em memória (Map).
   *
   * DECISÃO ARQUITETURAL: Optamos por manter em memória em vez de Redis/banco.
   * Justificativa: o cooldown é proteção anti-spam, não dado crítico.
   * Se o servidor reiniciar, o pior cenário é o bot responder 1x a mais num grupo.
   * Isso NÃO vale a complexidade de persistir no banco ou depender de Redis disponível.
   *
   * UPGRADE FUTURO: Se Redis estiver disponível (isRedisAvailable), pode-se migrar para:
   *   await redis.set(`cooldown:${agentId}:${groupId}`, Date.now(), 'EX', cooldownSeconds);
   *   const last = await redis.get(`cooldown:${agentId}:${groupId}`);
   */
  static groupCooldowns = new Map<string, number>();

  static checkGroupCooldown(agentId: string, groupId: string, cooldownSeconds: number): boolean {
    const key = `${agentId}:${groupId}`;
    const lastResponse = this.groupCooldowns.get(key) || 0;
    const now = Date.now();

    if (now - lastResponse < cooldownSeconds * 1000) return false; // em cooldown

    this.groupCooldowns.set(key, now);
    return true;
  }

  // ── Gestão de AccessRequests ──

  static async approveAccess(agentId: string, senderId: string) {
    return prisma.accessRequest.update({
      where: { agentId_senderId: { agentId, senderId } },
      data: { status: 'approved', reviewedAt: new Date() },
    });
  }

  static async rejectAccess(agentId: string, senderId: string) {
    return prisma.accessRequest.update({
      where: { agentId_senderId: { agentId, senderId } },
      data: { status: 'rejected', reviewedAt: new Date() },
    });
  }

  static async getPendingRequests(tenantId: string, agentId?: string) {
    return prisma.accessRequest.findMany({
      where: { tenantId, ...(agentId ? { agentId } : {}), status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  }
}
