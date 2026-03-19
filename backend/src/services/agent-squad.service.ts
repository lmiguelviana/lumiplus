import { prisma } from '../lib/prisma.js';

/**
 * Serviço para gerenciar a squad padrão de cada agente.
 * Cada agente recebe automaticamente uma squad onde ele é o líder.
 */
export class AgentSquadService {

  /**
   * Cria a squad padrão do agente (ele como líder).
   * Chamado automaticamente na criação de todo agente.
   */
  static async createDefaultSquad(tenantId: string, agentId: string, agentName: string): Promise<string> {
    const squad = await prisma.squad.create({
      data: {
        tenantId,
        name: `Squad ${agentName}`,
        description: `Squad padrão do agente ${agentName}`,
      }
    });

    // Agente como líder da squad
    await prisma.squadMember.create({
      data: {
        squadId: squad.id,
        agentId,
        role: 'leader',
      }
    });

    console.log(`[AgentSquad] Squad "${squad.name}" criada para agente ${agentName} (líder)`);
    return squad.id;
  }

  /**
   * Retorna a squad padrão do agente (onde ele é líder).
   */
  static async getAgentSquad(tenantId: string, agentId: string) {
    const membership = await prisma.squadMember.findFirst({
      where: { agentId, role: 'leader' },
      include: {
        squad: {
          include: {
            members: {
              include: {
                agent: {
                  select: { id: true, name: true, slug: true, mission: true, status: true }
                }
              }
            }
          }
        }
      }
    });

    if (!membership) return null;

    // Verificar se a squad pertence ao tenant
    if (membership.squad.tenantId !== tenantId) return null;

    return membership.squad;
  }

  /**
   * Adiciona um agente como membro da squad de outro agente.
   */
  static async addMember(tenantId: string, leaderAgentId: string, memberAgentId: string): Promise<string> {
    const squad = await this.getAgentSquad(tenantId, leaderAgentId);
    if (!squad) throw new Error('Squad não encontrada para este agente.');

    // Verifica se o membro existe
    const member = await prisma.agent.findFirst({
      where: { id: memberAgentId, tenantId, status: 'active', deletedAt: null }
    });
    if (!member) throw new Error('Agente membro não encontrado.');

    // Verifica se já está na squad
    const existing = await prisma.squadMember.findUnique({
      where: { squadId_agentId: { squadId: squad.id, agentId: memberAgentId } }
    });
    if (existing) throw new Error(`${member.name} já faz parte da squad.`);

    await prisma.squadMember.create({
      data: {
        squadId: squad.id,
        agentId: memberAgentId,
        role: 'worker',
      }
    });

    console.log(`[AgentSquad] ${member.name} adicionado à squad do agente ${leaderAgentId}`);
    return member.name;
  }

  /**
   * Remove um membro da squad (não pode remover o líder).
   */
  static async removeMember(tenantId: string, leaderAgentId: string, memberAgentId: string): Promise<string> {
    const squad = await this.getAgentSquad(tenantId, leaderAgentId);
    if (!squad) throw new Error('Squad não encontrada.');

    if (memberAgentId === leaderAgentId) throw new Error('Não é possível remover o líder da squad.');

    const membership = await prisma.squadMember.findUnique({
      where: { squadId_agentId: { squadId: squad.id, agentId: memberAgentId } }
    });
    if (!membership) throw new Error('Agente não faz parte desta squad.');

    const member = squad.members.find(m => m.agentId === memberAgentId);
    await prisma.squadMember.delete({ where: { id: membership.id } });

    return member?.agent.name || 'Agente';
  }

  /**
   * Executa a squad do agente com uma tarefa.
   */
  static async execute(tenantId: string, agentId: string, task: string): Promise<string> {
    const squad = await this.getAgentSquad(tenantId, agentId);
    if (!squad) throw new Error('Squad não encontrada. O agente não possui uma squad.');

    const { SwarmService } = await import('./swarm.service.js');
    return SwarmService.executeSquadTask(tenantId, squad.id, task);
  }

  /**
   * Garante que um agente tem squad (para agentes criados antes desta feature).
   */
  static async ensureSquad(tenantId: string, agentId: string, agentName: string): Promise<string> {
    const existing = await this.getAgentSquad(tenantId, agentId);
    if (existing) return existing.id;
    return this.createDefaultSquad(tenantId, agentId, agentName);
  }
}
