import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import pino from 'pino';
import { env } from './config/env.js';
import { aiRoutes } from './routes/ai.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { configRoutes } from './routes/config.routes.js';
import { channelRoutes } from './routes/channel.routes.js';
import { knowledgeRoutes } from './routes/knowledge.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import workflowRoutes from './routes/workflows.routes.js';
import squadRoutes from './routes/squad.routes.js';
import cronRoutes from './routes/cron.routes.js';
import { skillsRoutes } from './routes/skills.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { bootstrapBots } from './bots.js';

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  },
  bodyLimit: 5 * 1024 * 1024 // 5MB — canvas com muitos nós pode ser grande
});

// Registro de Plugins e Rotas
server.register(cors, {
  origin: true, // Permite todas as origens em desenvolvimento
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});

server.register(jwt, {
  secret: env.JWT_SECRET
});

server.register(websocket);

server.register(aiRoutes, { prefix: '/v1/ai' });
server.register(dashboardRoutes, { prefix: '/v1/dashboard' });
server.register(configRoutes, { prefix: '/v1/config' });
server.register(channelRoutes, { prefix: '/v1/channels' });
server.register(knowledgeRoutes, { prefix: '/v1/knowledge' });
server.register(analyticsRoutes, { prefix: '/v1/analytics' });
server.register(settingsRoutes, { prefix: '/v1/settings' });
server.register(workflowRoutes, { prefix: '/v1/workflows' });
server.register(squadRoutes, { prefix: '/v1/squads' });
server.register(cronRoutes, { prefix: '/v1/crons' });
server.register(skillsRoutes, { prefix: '/v1/skills' });
server.register(authRoutes, { prefix: '/v1/auth' });

// Rota de Health Check (Pública)
server.get('/health', async () => {
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV
  };
});

const start = async () => {
  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 Lumi Plus Backend rodando em http://localhost:${env.PORT}`);
    
    // Inicializa os canais de comunicação (Bots)
    bootstrapBots().catch(console.error);

    // Inicializa o sistema de agendamentos (Cron)
    const { CronService } = await import('./services/cron.service.js');
    CronService.init().catch(console.error);

    // Inicializa o Worker do BullMQ para Workflows
    await import('./workers/workflow.worker.js');
    console.log('👷 Workflow Worker ativado e aguardando jobs...');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
