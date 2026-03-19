import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { channelManager } from '../services/channel-manager.service.js';


export async function channelRoutes(server: FastifyInstance) {
  
  /**
   * WebSocket: Streaming de Status e QR Code
   * Path: /v1/channels/ws?agentId=...&type=whatsapp
   */
  server.get('/ws', { websocket: true }, (connection, req: FastifyRequest) => {
    const { agentId, type } = req.query as { agentId: string, type: string };

    console.log(`📡 Tentativa de conexão WS: agentId=${agentId}, type=${type}`);

    if (!agentId || !type) {
      console.warn('⚠️ Conexão WS recusada: agentId ou type ausentes na query');
      connection.send(JSON.stringify({ type: 'ERROR', message: 'agentId e type são obrigatórios' }));
      connection.close();
      return;
    }
    channelManager.startChannel(agentId, type as any).catch(err => {
      connection.send(JSON.stringify({ type: 'ERROR', message: err.message }));
    });

    // Loop de monitoramento de status
    const interval = setInterval(() => {
      const instance = channelManager.getInstance(agentId, type);
      if (instance) {
        connection.send(JSON.stringify({
          type: 'STATUS_UPDATE',
          status: instance.status,
          qr: instance.qr
        }));

        if (instance.status === 'OPEN') {
           // Opcionalmente manter aberto para monitorar quedas
        }
      }
    }, 2000);

    connection.on('close', () => {
      console.log(`🔌 Dashboard desconectado do WS: Agente ${agentId}`);
      clearInterval(interval);
    });
  });

  /**
   * Listar canais do agente (busca tokens configurados em AgentApiKey)
   */
  server.get('/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };

    const keys = await prisma.agentApiKey.findMany({
      where: { agentId, provider: { in: ['whatsapp', 'telegram', 'discord'] } },
      select: { provider: true, createdAt: true }
    });

    const configured = new Set(keys.map(k => k.provider));

    const channels = [
      { type: 'whatsapp', status: configured.has('whatsapp') ? 'active' : 'inactive', configuredAt: keys.find(k => k.provider === 'whatsapp')?.createdAt || null },
      { type: 'telegram', status: configured.has('telegram') ? 'active' : 'inactive', configuredAt: keys.find(k => k.provider === 'telegram')?.createdAt || null },
      { type: 'webchat', status: 'active', configuredAt: null },
    ];

    return { channels };
  });

  /**
   * Desconectar canal do agente
   */
  server.delete('/:agentId/:type', async (req, reply) => {
    const { agentId, type } = req.params as { agentId: string; type: string };

    const key = await prisma.agentApiKey.findFirst({
      where: { agentId, provider: type }
    });

    if (!key) return reply.status(404).send({ error: 'Canal não encontrado' });

    await prisma.agentApiKey.delete({ where: { id: key.id } });

    // Parar o canal se estiver rodando
    try { channelManager.stopChannel(agentId, type); } catch (_) {}

    return { ok: true };
  });

  /**
   * Conectar canal manual (Telegram/Discord)
   */
  server.post('/:agentId/connect', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const { type, token } = req.body as { type: string, token: string };

    if (!type || !token) return reply.status(400).send({ error: 'type e token são obrigatórios' });

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' });

    // Parar instância existente antes de reconectar
    try { channelManager.stopChannel(agentId, type); } catch (_) {}

    // Criptografar e salvar a chave
    const { encrypt } = await import('../utils/vault.js');
    const { env } = await import('../config/env.js');
    const encrypted = encrypt(token, env.VAULT_MASTER_KEY);

    const existingKey = await prisma.agentApiKey.findFirst({
      where: { agentId, provider: type }
    });

    if (existingKey) {
      await prisma.agentApiKey.update({
        where: { id: existingKey.id },
        data: {
          keyEncrypted: encrypted.encrypted,
          keyIv: encrypted.iv
        }
      });
    } else {
      await prisma.agentApiKey.create({
        data: {
          tenantId: agent.tenantId,
          agentId,
          provider: type,
          keyEncrypted: encrypted.encrypted,
          keyIv: encrypted.iv
        }
      });
    }

    // Iniciar o canal dinamicamente
    await channelManager.startChannel(agentId, type as any);
    
    return { success: true };
  });
}
