import { prisma } from '../lib/prisma.js';


export interface LumiMessage {
  id: string;
  channelType: string;
  channelId: string;
  senderId: string;
  senderName?: string;
  content: string;
  isCommand: boolean;
}

const ADMIN_COMMANDS = ['/config', '/memoria', '/logs', '/pausar', '/retomar', '/run'];
const USER_COMMANDS = ['/start', '/agentes', '/usar', '/resetar', '/status', '/ajuda', '/squad', '/skills'];

export class CommandService {

  static async handle(message: LumiMessage, tenantId: string, isOwner: boolean): Promise<string | null> {
    const [cmd, ...args] = message.content.trim().split(/\s+/);
    
    // Se não for um comando conhecido, ignora
    if (!USER_COMMANDS.includes(cmd) && !ADMIN_COMMANDS.includes(cmd)) {
      return null;
    }

    // Comandos admin — verifica permissão
    if (ADMIN_COMMANDS.includes(cmd) && !isOwner) {
      return '⚠️ Comando restrito ao administrador do workspace.';
    }

    switch (cmd) {
      case '/start':
        return '👋 Olá! Sou o assistente roteador do Lumi Plus. Use `/ajuda` para ver o que posso fazer.';
      case '/ajuda':
        return this.getHelpText();
      case '/agentes':
        return this.listAgents(tenantId);
      case '/usar':
        return this.switchAgent(tenantId, message, args[0]);
      case '/status':
        return this.getStatus(tenantId, message);
      case '/resetar':
        return '🔄 Memória da conversa reiniciada (funcionalidade em desenvolvimento).';
      case '/squad':
        return this.listSquads(tenantId, args.join(' ') || undefined, message);
      case '/skills':
        return this.listSkills(tenantId, message);
      case '/config':
        return '⚙️ Configuração via chat em breve.';
      case '/memoria':
        return '📧 O que eu sei sobre você (longo prazo): [Em desenvolvimento]';
      case '/logs':
        return '📊 Últimas interações registradas no banco.';
      case '/run':
        return this.runWorkflow(tenantId, args);
      default:
        return 'Comando reconhecido, mas não implementado.';
    }
  }

  private static getHelpText(): string {
    return `🚀 *Lumi Plus — Comandos*

*Usuário:*
/agentes - Lista agentes disponíveis
/usar <n> - Troca de agente
/squad - Ver/gerenciar squad do agente ativo
/squad add <agente> - Adicionar membro à squad
/squad executar <tarefa> - Executar tarefa com a squad
/skills - Ver skills ativas do agente
/resetar - Limpa memória da conversa
/status - Ver agente ativo
/ajuda - Mostra esta mensagem

*Admin:*
/config - Configurações rápidas
/memoria - Ver dados salvos do contato
/logs - Ver logs de latência/tokens
/pausar - Pausa o bot
/retomar - Retoma o bot
/run <nome> - Dispara um workflow específico`;
  }

  private static async listAgents(tenantId: string): Promise<string> {
    const agents = await prisma.agent.findMany({
      where: { 
        tenantId,
        status: 'active',
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    if (agents.length === 0) return 'Nenhum agente ativo encontrado neste workspace.';

    let text = '🤖 *Agentes disponíveis no seu workspace:*\n\n';
    agents.forEach((agent, i) => {
      text += `${i + 1}️⃣ *${agent.name}* — ${agent.mission || 'Sem missão definida'}\n`;
    });
    text += '\nDigite `/usar <número>` para trocar.';
    return text;
  }

  private static async switchAgent(tenantId: string, message: LumiMessage, indexStr: string): Promise<string> {
    const index = parseInt(indexStr) - 1;
    if (isNaN(index)) return 'Por favor, indique o número do agente. Ex: `/usar 1`';

    const agents = await prisma.agent.findMany({
      where: { tenantId, status: 'active', deletedAt: null },
      orderBy: { createdAt: 'asc' }
    });

    const selected = agents[index];
    if (!selected) return 'Agente não encontrado. Use `/agentes` para ver a lista.';

    // Salvar no metadata da conversação
    await prisma.channelConversation.update({
      where: {
        tenantId_channel_externalId: {
          tenantId,
          channel: message.channelType,
          externalId: message.senderId
        }
      },
      data: {
        agentId: selected.id,
        metadata: {
          activeAgentName: selected.name
        }
      }
    });

    return `✅ Conectado ao *${selected.name}*!`;
  }

  private static async getStatus(tenantId: string, message: LumiMessage): Promise<string> {
    const conv = await prisma.channelConversation.findUnique({
      where: {
        tenantId_channel_externalId: {
          tenantId,
          channel: message.channelType,
          externalId: message.senderId
        }
      },
      include: { agent: true }
    });

    if (!conv) return 'Nenhuma conversação ativa encontrada.';
    return `📍 *Status:*
Agente ativo: ${conv.agent.name}
Canal: ${message.channelType}
Workspace ID: ${tenantId.slice(0, 8)}...`;
  }

  private static async listSquads(tenantId: string, subCmd?: string, message?: LumiMessage): Promise<string> {
    const { AgentSquadService } = await import('./agent-squad.service.js');

    // Pegar agente ativo da conversa
    let activeAgentId: string | null = null;
    if (message) {
      const conv = await prisma.channelConversation.findUnique({
        where: {
          tenantId_channel_externalId: { tenantId, channel: message.channelType, externalId: message.senderId },
        },
      });
      activeAgentId = conv?.agentId || null;
    }

    // Sub-comandos: /squad add <agente>, /squad remover <agente>, /squad executar <tarefa>
    if (subCmd && activeAgentId) {
      const args = subCmd.split(/\s+/);
      const action = args[0]?.toLowerCase();
      const param = args.slice(1).join(' ');

      if (action === 'add' && param) {
        // Buscar agente pelo nome ou número
        const agents = await prisma.agent.findMany({
          where: { tenantId, status: 'active', deletedAt: null },
          orderBy: { createdAt: 'asc' }
        });
        const index = parseInt(param) - 1;
        const target = !isNaN(index) ? agents[index] : agents.find(a =>
          a.name.toLowerCase().includes(param.toLowerCase()) || a.slug.includes(param.toLowerCase())
        );
        if (!target) return `❌ Agente "${param}" não encontrado. Use /agentes para ver a lista.`;

        try {
          const name = await AgentSquadService.addMember(tenantId, activeAgentId, target.id);
          return `✅ *${name}* adicionado à squad do agente ativo!`;
        } catch (e: any) {
          return `❌ ${e.message}`;
        }
      }

      if (action === 'remover' && param) {
        const agents = await prisma.agent.findMany({
          where: { tenantId, status: 'active', deletedAt: null },
          orderBy: { createdAt: 'asc' }
        });
        const index = parseInt(param) - 1;
        const target = !isNaN(index) ? agents[index] : agents.find(a =>
          a.name.toLowerCase().includes(param.toLowerCase())
        );
        if (!target) return `❌ Agente "${param}" não encontrado.`;

        try {
          const name = await AgentSquadService.removeMember(tenantId, activeAgentId, target.id);
          return `✅ *${name}* removido da squad.`;
        } catch (e: any) {
          return `❌ ${e.message}`;
        }
      }

      if (action === 'executar' || action === 'exec' || action === 'run') {
        const task = param || 'Descreva o que a squad deve fazer.';
        if (!param) return '⚠️ Uso: `/squad executar <descrição da tarefa>`';

        try {
          const result = await AgentSquadService.execute(tenantId, activeAgentId, task);
          return `🚀 *Resultado da Squad:*\n\n${result}`;
        } catch (e: any) {
          return `❌ Erro na execução: ${e.message}`;
        }
      }
    }

    // Sem sub-comando: mostrar squad do agente ativo
    if (activeAgentId) {
      const squad = await AgentSquadService.getAgentSquad(tenantId, activeAgentId);
      if (squad) {
        const leader = squad.members.find((m: any) => m.role === 'leader');
        const workers = squad.members.filter((m: any) => m.role !== 'leader');

        let text = `🫂 *${squad.name}*\n\n`;
        text += `👑 Líder: *${leader?.agent.name || 'N/A'}*\n`;
        if (workers.length > 0) {
          text += `\n👥 Membros:\n`;
          workers.forEach((w: any, i: number) => {
            text += `  ${i + 1}. *${w.agent.name}* — ${w.agent.mission || 'Sem missão'}\n`;
          });
        } else {
          text += '\n_Nenhum membro adicionado ainda._\n';
        }
        text += '\n*Comandos:*\n';
        text += '`/squad add <agente>` — Adicionar membro\n';
        text += '`/squad remover <agente>` — Remover membro\n';
        text += '`/squad executar <tarefa>` — Executar tarefa com a squad';
        return text;
      }

      // Agente antigo sem squad — criar automaticamente
      const agent = await prisma.agent.findUnique({ where: { id: activeAgentId } });
      if (agent) {
        await AgentSquadService.ensureSquad(tenantId, activeAgentId, agent.name);
        return '✅ Squad criada automaticamente! Use `/squad` novamente para ver detalhes.';
      }
    }

    // Fallback: listar todas as squads
    const squads = await prisma.squad.findMany({
      where: { tenantId },
      include: { _count: { select: { members: true } } },
    });

    if (squads.length === 0) return 'Nenhuma squad encontrada. Crie um agente para gerar uma squad automaticamente.';

    let text = '🫂 *Squads do workspace:*\n\n';
    squads.forEach((s: any, i: number) => {
      text += `${i + 1}. *${s.name}* — ${s._count.members} membros\n`;
    });
    text += '\nSelecione um agente com `/usar <n>` e depois use `/squad` para gerenciar.';
    return text;
  }

  private static async runWorkflow(tenantId: string, args: string[]): Promise<string> {
    if (args.length === 0) return 'Por favor, indique o nome do workflow. Ex: `/run Meu Filtro`';
    const name = args.join(' ');

    const workflow = await prisma.workflow.findFirst({
      where: { 
        tenantId, 
        name: { contains: name, mode: 'insensitive' },
        status: 'active'
      }
    });

    if (!workflow) return `❌ Workflow "${name}" não encontrado ou inativo.`;

    try {
      const { WorkflowRunnerService } = await import('./workflow-runner.service.js');
      const run = await WorkflowRunnerService.triggerWorkflow(tenantId, workflow.id, {
        triggeredBy: 'chat_command',
        channel: 'external'
      });
      return `🚀 Workflow *${workflow.name}* iniciado!\nRun ID: \`${run.id.slice(0, 8)}\`...`;
    } catch (e: any) {
      return `❌ Erro ao disparar workflow: ${e.message}`;
    }
  }

  private static async listSkills(tenantId: string, message: LumiMessage): Promise<string> {
    // Buscar agente ativo da conversa
    const conv = await prisma.channelConversation.findUnique({
      where: {
        tenantId_channel_externalId: { tenantId, channel: message.channelType, externalId: message.senderId },
      },
    });

    const agentId = conv?.agentId;
    if (!agentId) return 'Nenhum agente ativo. Use /usar <n> para selecionar.';

    const skills = await prisma.agentSkill.findMany({
      where: { tenantId, agentId, enabled: true },
    });

    if (skills.length === 0) return 'Nenhuma skill ativa para este agente. Ative no painel web: /skills';

    let text = '⚡ *Skills ativas:*\n\n';
    skills.forEach((s: any) => {
      text += `• ${s.skillId}\n`;
    });
    text += '\nGerencie skills no painel web: /skills';
    return text;
  }
}
