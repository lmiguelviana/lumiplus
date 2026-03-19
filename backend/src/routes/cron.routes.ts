import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { CronService } from '../services/cron.service.js';
import cron from 'node-cron';


export default async function cronRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /v1/crons/:agentId — lista crons do agente
  fastify.get('/:agentId', async (req, reply) => {
    const { tenantId } = req.user as any;
    const { agentId } = req.params as { agentId: string };

    const crons = await prisma.agentCronJob.findMany({
      where: { tenantId, agentId },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ crons });
  });

  // POST /v1/crons/:agentId — cria novo cron
  fastify.post('/:agentId', async (req, reply) => {
    const { tenantId } = req.user as any;
    const { agentId } = req.params as { agentId: string };
    const { name, prompt, schedule, timezone, enabled } = req.body as {
      name: string;
      prompt: string;
      schedule: string;
      timezone?: string;
      enabled?: boolean;
    };

    if (!name || !prompt || !schedule) {
      return reply.status(400).send({ error: 'name, prompt e schedule são obrigatórios' });
    }

    if (!cron.validate(schedule)) {
      return reply.status(400).send({ error: `Schedule inválido: "${schedule}". Use formato cron (ex: "0 9 * * *")` });
    }

    const created = await prisma.agentCronJob.create({
      data: {
        tenantId,
        agentId,
        name,
        prompt,
        schedule,
        timezone: timezone || 'America/Sao_Paulo',
        enabled: enabled !== false
      }
    });

    // Recarrega o scheduler para pegar o novo cron
    CronService.reload().catch(console.error);

    return reply.status(201).send(created);
  });

  // PATCH /v1/crons/:agentId/:id — edita cron
  fastify.patch('/:agentId/:id', async (req, reply) => {
    const { tenantId } = req.user as any;
    const { agentId, id } = req.params as { agentId: string; id: string };
    const body = req.body as {
      name?: string;
      prompt?: string;
      schedule?: string;
      timezone?: string;
      enabled?: boolean;
    };

    // Valida schedule se fornecido
    if (body.schedule && !cron.validate(body.schedule)) {
      return reply.status(400).send({ error: `Schedule inválido: "${body.schedule}"` });
    }

    const existing = await prisma.agentCronJob.findFirst({
      where: { id, tenantId, agentId }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Agendamento não encontrado' });
    }

    const updated = await prisma.agentCronJob.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.prompt !== undefined && { prompt: body.prompt }),
        ...(body.schedule !== undefined && { schedule: body.schedule }),
        ...(body.timezone !== undefined && { timezone: body.timezone }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
      }
    });

    CronService.reload().catch(console.error);

    return reply.send(updated);
  });

  // DELETE /v1/crons/:agentId/:id — remove cron
  fastify.delete('/:agentId/:id', async (req, reply) => {
    const { tenantId } = req.user as any;
    const { agentId, id } = req.params as { agentId: string; id: string };

    const existing = await prisma.agentCronJob.findFirst({
      where: { id, tenantId, agentId }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Agendamento não encontrado' });
    }

    await prisma.agentCronJob.delete({ where: { id } });

    CronService.reload().catch(console.error);

    return reply.send({ ok: true });
  });

  // POST /v1/crons/:agentId/:id/run — disparo manual (testar)
  fastify.post('/:agentId/:id/run', async (req, reply) => {
    const { tenantId } = req.user as any;
    const { agentId, id } = req.params as { agentId: string; id: string };

    const job = await prisma.agentCronJob.findFirst({
      where: { id, tenantId, agentId }
    });

    if (!job) {
      return reply.status(404).send({ error: 'Agendamento não encontrado' });
    }

    // Executa de forma assíncrona e retorna imediatamente
    CronService.executeJob(job.id).catch(console.error);

    return reply.send({ ok: true, message: `Executando "${job.name}" agora...` });
  });
}
