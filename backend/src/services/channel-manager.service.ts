import { WhatsAppService } from './whatsapp.service.js';
import { TelegramService } from './telegram.service.js';
import { DiscordService } from './discord.service.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';


export type BotInstance = {
  type: 'whatsapp' | 'telegram' | 'discord';
  service: any;
  status: 'STARTING' | 'OPEN' | 'QR_READY' | 'CLOSED' | 'ERROR';
  qr?: string;
};

class ChannelManager {
  private instances = new Map<string, BotInstance>(); // key: agentId:type

  /**
   * Inicializa um canal específico para um agente
   */
  async startChannel(agentId: string, type: 'whatsapp' | 'telegram' | 'discord') {
    const key = `${agentId}:${type}`;
    if (this.instances.has(key)) {
      const inst = this.instances.get(key)!;
      if (inst.status === 'OPEN' || inst.status === 'STARTING') return inst;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { tenant: true }
    });

    if (!agent) throw new Error('Agente não encontrado');

    if (type === 'whatsapp') {
      const sessionName = `session_${agent.tenantId.slice(0, 8)}_${agent.id.slice(0, 8)}`;
      const whatsapp = new WhatsAppService(agent.tenantId, agent.id, sessionName);
      
      const instance: BotInstance = { type, service: whatsapp, status: 'STARTING' };
      this.instances.set(key, instance);

      whatsapp.on('qr', (qr) => {
        instance.qr = qr;
        instance.status = 'QR_READY';
      });

      whatsapp.on('status', (status) => {
        instance.status = status;
        if (status === 'OPEN') instance.qr = undefined;
      });

      whatsapp.start().catch(err => {
        instance.status = 'ERROR';
        console.error(`❌ Erro no canal WA (${agent.name}):`, err);
      });

      return instance;
    }

    if (type === 'telegram') {
      const tgKey = await prisma.agentApiKey.findFirst({
        where: { agentId: agent.id, provider: 'telegram' }
      }) || await prisma.agentApiKey.findFirst({
        where: { tenantId: agent.tenantId, agentId: null, provider: 'telegram' }
      });

      const tgToken = tgKey ? await this.decryptKey(tgKey) : env.TELEGRAM_BOT_TOKEN;
      if (!tgToken) throw new Error('Token do Telegram não configurado');

      const telegram = new TelegramService(tgToken, agent.tenantId, agent.id);
      const instance: BotInstance = { type, service: telegram, status: 'STARTING' };
      this.instances.set(key, instance);

      telegram.start()
        .then(() => { instance.status = 'OPEN'; console.log(`✅ Bot Telegram conectado para ${agent.name}`); })
        .catch(err => { instance.status = 'ERROR'; console.error(`❌ Erro no bot Telegram (${agent.name}):`, err?.message || err); });

      return instance;
    }

    // Adicionar Discord conforme necessário...
  }

  async stopChannel(agentId: string, type: string) {
    const key = `${agentId}:${type}`;
    const instance = this.instances.get(key);
    if (instance) {
      // Implementar lógica de stop nos services se necessário
      this.instances.delete(key);
    }
  }

  getInstance(agentId: string, type: string) {
    return this.instances.get(`${agentId}:${type}`);
  }

  private async decryptKey(apiKeyRecord: any): Promise<string> {
    const { decrypt } = await import('../utils/vault.js');
    return decrypt(apiKeyRecord.keyEncrypted, apiKeyRecord.keyIv, env.VAULT_MASTER_KEY);
  }
}

export const channelManager = new ChannelManager();
