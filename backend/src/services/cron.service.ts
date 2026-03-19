import { prisma } from '../lib/prisma.js';
import cron from 'node-cron';
import { AIService } from './ai.service.js';


export class CronService {
  private static tasks: Map<string, cron.ScheduledTask> = new Map();

  static async init() {
    console.log('⏰ [CRON] Inicializando sistema de agendamentos...');
    await this.refreshTasks();

    // Refresh tasks a cada 5 minutos para pegar novos agendamentos do banco
    cron.schedule('*/5 * * * *', () => {
      this.refreshTasks();
    });

    // Verifica aprovações expiradas a cada 5 minutos (timeout 24h default)
    cron.schedule('*/5 * * * *', () => {
      this.expireApprovals().catch(console.error);
    });
  }

  /** Rejeita automaticamente aprovações pendentes há mais de 24h */
  private static async expireApprovals() {
    try {
      const expired = await prisma.humanApproval.findMany({
        where: {
          status: 'pending',
          createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      });

      for (const approval of expired) {
        await prisma.humanApproval.update({
          where: { id: approval.id },
          data: { status: 'rejected' }
        });
        await prisma.workflowRun.update({
          where: { id: approval.runId },
          data: { status: 'failed', error: 'Aprovação expirou (timeout 24h)', endedAt: new Date() }
        });
        console.log(`⏰ [CRON] Aprovação ${approval.id.slice(0, 8)} expirada (24h timeout)`);
      }
    } catch (e) {
      console.error('❌ [CRON] Erro ao verificar aprovações expiradas:', e);
    }
  }

  static async refreshTasks() {
    try {
      const activeJobs = await prisma.agentCronJob.findMany({
        where: { enabled: true }
      });

      // Parar tarefas que não estão mais no banco ou foram desativadas
      const activeJobIds = activeJobs.map(j => j.id);
      for (const [id, task] of this.tasks.entries()) {
        if (!activeJobIds.includes(id)) {
          task.stop();
          this.tasks.delete(id);
          console.log(`🛑 [CRON] Tarefa removida/desativada: ${id}`);
        }
      }

      // Iniciar/Agendar novas tarefas
      for (const job of activeJobs) {
        if (!this.tasks.has(job.id)) {
          if (!cron.validate(job.schedule)) {
            console.error(`❌ [CRON] Schedule inválido para "${job.name}": ${job.schedule}`);
            continue;
          }
          const task = cron.schedule(job.schedule, () => {
            this.executeJob(job.id);
          }, { timezone: job.timezone });
          this.tasks.set(job.id, task);
          console.log(`✅ [CRON] Tarefa agendada: ${job.name} (${job.schedule}) tz=${job.timezone}`);
        }
      }
    } catch (error) {
      console.error('❌ [CRON] Erro ao carregar tarefas:', error);
    }
  }

  static async executeJob(jobId: string) {
    console.log(`🚀 [CRON] Executando job: ${jobId}`);
    try {
      const job = await prisma.agentCronJob.findUnique({
        where: { id: jobId },
        include: { agent: true }
      });

      if (!job || !job.enabled) return;

      const response = await AIService.complete(
        job.tenantId,
        job.agentId,
        [{ role: 'user', content: job.prompt }]
      );

      console.log(`📝 [CRON] "${job.name}" → ${response.content.slice(0, 120)}...`);

      await prisma.agentCronJob.update({
        where: { id: jobId },
        data: {
          lastRunAt: new Date(),
          lastResult: response.model === 'error' ? 'error' : 'success'
        }
      });
    } catch (error: any) {
      console.error(`❌ [CRON] Falha ao executar job ${jobId}:`, error?.message);
      await prisma.agentCronJob.update({
        where: { id: jobId },
        data: { lastRunAt: new Date(), lastResult: 'error' }
      }).catch(() => {});
    }
  }

  /** Força refresh imediato (chamado ao criar/editar/deletar cron via API) */
  static async reload() {
    // Para todas as tarefas existentes
    for (const [id, task] of this.tasks.entries()) {
      task.stop();
      this.tasks.delete(id);
    }
    await this.refreshTasks();
  }
}
