import { prisma } from '../lib/prisma.js';
import { channelManager } from './channel-manager.service.js';
import { settingsService } from './settings.service.js';


/**
 * Envia notificação ao humano quando um workflow pausa em Human Approval.
 * Cria registro HumanApproval e envia mensagem via Telegram/WhatsApp com comandos inline.
 */
export async function notifyHumanApproval(params: {
  tenantId: string;
  runId: string;
  nodeLabel?: string;
  notifyTelegram?: boolean;
  notifyWhatsapp?: boolean;
}): Promise<void> {
  const { tenantId, runId, nodeLabel, notifyTelegram, notifyWhatsapp } = params;

  // Cria registro de aprovação pendente
  const approval = await prisma.humanApproval.create({
    data: {
      tenantId,
      runId,
      context: { nodeLabel, notifyTelegram, notifyWhatsapp },
      status: 'pending'
    }
  });

  const shortId = approval.id.slice(0, 8);
  const message = [
    `🔔 *Aprovação Necessária*`,
    ``,
    `Etapa: ${nodeLabel || 'Human Approval'}`,
    `Run: \`${runId.slice(0, 12)}\``,
    ``,
    `Responda com:`,
    `/aprovar_${shortId} — continuar execução`,
    `/rejeitar_${shortId} — cancelar workflow`,
  ].join('\n');

  // Busca um agente do tenant para usar o bot
  const agent = await prisma.agent.findFirst({
    where: { tenantId, deletedAt: null, status: 'active' }
  });
  if (!agent) return;

  if (notifyTelegram) {
    try {
      const chatId = await settingsService.get(tenantId, 'approval_telegram_chat_id');
      if (chatId) {
        let inst = channelManager.getInstance(agent.id, 'telegram');
        if (!inst?.service?.sendMessage) {
          await channelManager.startChannel(agent.id, 'telegram');
          inst = channelManager.getInstance(agent.id, 'telegram');
        }
        if (inst?.service?.sendMessage) {
          await inst.service.sendMessage(chatId.trim(), message);
          console.log(`[WorkflowApproval] Telegram enviado para ${chatId.slice(0, 10)}… (approval: ${shortId})`);
        }
      }
    } catch (e) {
      console.warn('[WorkflowApproval] Falha Telegram:', (e as Error).message);
    }
  }

  if (notifyWhatsapp) {
    try {
      const jid = await settingsService.get(tenantId, 'approval_whatsapp_jid');
      if (jid) {
        const normalizedJid = jid.includes('@') ? jid.trim() : `${jid.trim()}@s.whatsapp.net`;
        let inst = channelManager.getInstance(agent.id, 'whatsapp');
        if (!inst?.service?.sendMessage) {
          await channelManager.startChannel(agent.id, 'whatsapp');
          inst = channelManager.getInstance(agent.id, 'whatsapp');
        }
        if (inst?.service?.sendMessage) {
          await inst.service.sendMessage(normalizedJid, message);
          console.log(`[WorkflowApproval] WhatsApp enviado para ${normalizedJid.slice(0, 15)}… (approval: ${shortId})`);
        }
      }
    } catch (e) {
      console.warn('[WorkflowApproval] Falha WhatsApp:', (e as Error).message);
    }
  }
}

/**
 * Processa comando /aprovar_XXXX ou /rejeitar_XXXX recebido pelos bots.
 * Retorna mensagem de resposta ou null se não for comando de aprovação.
 */
export async function handleApprovalCommand(text: string): Promise<string | null> {
  const approveMatch = text.match(/^\/aprovar_([a-f0-9]+)/i);
  const rejectMatch = text.match(/^\/rejeitar_([a-f0-9]+)/i);

  if (!approveMatch && !rejectMatch) return null;

  const shortId = (approveMatch || rejectMatch)![1];
  const action = approveMatch ? 'approved' : 'rejected';

  // Busca approval pelo início do ID
  const approval = await prisma.humanApproval.findFirst({
    where: { id: { startsWith: shortId }, status: 'pending' }
  });

  if (!approval) {
    return `❌ Aprovação \`${shortId}\` não encontrada ou já processada.`;
  }

  // Atualiza status da aprovação
  await prisma.humanApproval.update({
    where: { id: approval.id },
    data: { status: action }
  });

  if (action === 'approved') {
    // Retoma o workflow
    const { WorkflowRunnerService } = await import('./workflow-runner.service.js');
    await WorkflowRunnerService.resumeWorkflow(approval.runId);
    return `✅ Aprovado! O workflow está sendo retomado.`;
  } else {
    // Rejeita — marca run como failed
    await prisma.workflowRun.update({
      where: { id: approval.runId },
      data: { status: 'failed', error: 'Rejeitado pelo aprovador', endedAt: new Date() }
    });
    return `🚫 Rejeitado. O workflow foi cancelado.`;
  }
}
