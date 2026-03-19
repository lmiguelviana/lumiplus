import { TelegramService } from './services/telegram.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';
import { DiscordService } from './services/discord.service.js';
import { prisma } from './lib/prisma.js';
import { env } from './config/env.js';

import { channelManager } from './services/channel-manager.service.js';


/**
 * Lumi Plus Bots Entrypoint 🚀
 * Inicializa dinamicamente os canais de todos os agentes ativos no sistema.
 */
export async function bootstrapBots() {
  console.log('🏁 Inicializando Orquestração Multitenant de Bots via ChannelManager...');

  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'active', deletedAt: null },
    });

    console.log(`🤖 Localizados ${agents.length} agentes ativos. Iniciando canais...`);

    for (const agent of agents) {
      // Ativa WhatsApp por padrão para todos (Fase 11 SaaS Style)
      channelManager.startChannel(agent.id, 'whatsapp').catch(e => 
        console.error(`  ❌ Falha ao iniciar WhatsApp para ${agent.name}:`, e.message)
      );

      // Tenta iniciar Telegram se houver chave configurada
      const tgKey = await prisma.agentApiKey.findFirst({
        where: { agentId: agent.id, provider: 'telegram' }
      }) || await prisma.agentApiKey.findFirst({
        where: { tenantId: agent.tenantId, agentId: null, provider: 'telegram' }
      });

      if (tgKey || env.TELEGRAM_BOT_TOKEN) {
        channelManager.startChannel(agent.id, 'telegram').catch(e => 
          console.error(`  ❌ Falha ao iniciar Telegram para ${agent.name}:`, e.message)
        );
      }
    }

    console.log('🚀 Orquestração de Canais Concluída!');

  } catch (error) {
    console.error('💥 Erro crítico no bootstrap de bots:', error);
  }
}

async function decryptKey(apiKeyRecord: any): Promise<string> {
  const { decrypt } = await import('./utils/vault.js');
  return decrypt(apiKeyRecord.keyEncrypted, apiKeyRecord.keyIv, env.VAULT_MASTER_KEY);
}

// O bootstrapBots deve ser chamado externamente (ex: pelo server.ts)
// para evitar execuções duplicadas durante o import.
