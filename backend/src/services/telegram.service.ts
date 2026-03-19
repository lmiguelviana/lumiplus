import { Telegraf } from 'telegraf';
import { AIService } from './ai.service.js';
import { HistoryService } from './history.service.js';
import { ButtonParserService } from './button-parser.service.js';
import { AccessControlService } from './access-control.service.js';
import { prisma } from '../lib/prisma.js';

export class TelegramService {
  private bot: Telegraf;

  constructor(
    private token: string,
    private tenantId: string,
    private agentId: string
  ) {
    this.bot = new Telegraf(token);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.on('text', async (ctx) => {
      const externalId = ctx.chat.id.toString();
      const userText = ctx.message.text;
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      const senderId = ctx.from.id.toString();

      try {
        // --- FASE 29: CONTROLE DE ACESSO ---
        const access = await AccessControlService.checkAccess(this.agentId, senderId, 'telegram');
        if (access === 'blocked') return;
        if (access === 'pending') {
          await ctx.reply('🔒 Seu acesso está pendente de aprovação.');
          return;
        }

        // --- FASE 28: GRUPOS ---
        if (isGroup) {
          const agent = await prisma.agent.findUnique({ where: { id: this.agentId } });
          if (!agent) return;

          const botUsername = (ctx as any).botInfo?.username || '';
          const isMentioned = ctx.message.entities?.some((e: any) =>
            e.type === 'mention' && userText.substring(e.offset, e.offset + e.length) === `@${botUsername}`
          );

          const shouldRespond = AccessControlService.shouldRespondInGroup(agent, {
            text: userText,
            isGroup: true,
            agentName: agent.name,
            quotedParticipant: (ctx.message as any).reply_to_message?.from?.id?.toString(),
            botJid: (ctx as any).botInfo?.id?.toString(),
          }) || isMentioned;

          if (!shouldRespond) return;
          if (!AccessControlService.checkGroupCooldown(this.agentId, externalId, agent.groupCooldown || 5)) return;
        }

        // --- HANDLER DE APROVAÇÃO (intercepta antes dos comandos normais) ---
        if (userText.startsWith('/aprovar_') || userText.startsWith('/rejeitar_')) {
          const { handleApprovalCommand } = await import('./workflow-approval-notify.service.js');
          const reply = await handleApprovalCommand(userText);
          if (reply) { await ctx.reply(reply, { parse_mode: 'Markdown' }); return; }
        }

        // --- HANDLER DE COMANDOS ---
        if (userText.startsWith('/')) {
          const { CommandService } = await import('./command.service.js');
          const commandResponse = await CommandService.handle(
            {
              id: ctx.message.message_id.toString(),
              channelType: 'telegram',
              channelId: ctx.chat.id.toString(),
              senderId: ctx.from.id.toString(),
              senderName: ctx.from.first_name,
              content: userText,
              isCommand: true
            },
            this.tenantId,
            true // Placeholder: assumindo dono
          );

          if (commandResponse) {
            await ctx.reply(commandResponse, { parse_mode: 'Markdown' });
            return; // Interrompe fluxo
          }
        }
        // ---------------------------

        // 1. Obter ou criar conversa
        const conversation = await HistoryService.getOrCreateConversation({
          tenantId: this.tenantId,
          agentId: this.agentId,
          channel: 'telegram',
          externalId,
          metadata: {
            username: ctx.from.username,
            firstName: ctx.from.first_name,
          },
        });

        // 2. Salvar mensagem do usuário
        await HistoryService.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: userText,
        });

        // 3. Recuperar contexto histórico (últimas 10 mensagens)
        const context = await HistoryService.getRecentContext(conversation.id);

        // 4. Chamar a IA
        // Nota: O orquestrador já faz o RAG internamente baseado na última mensagem.
        const response = await AIService.complete(
          this.tenantId,
          this.agentId,
          context,
          undefined,
          'telegram'
        );

        // 5. Responder ao usuário no Telegram (com botões se houver)
        const parsed = ButtonParserService.parse(response.content);
        if (parsed.hasButtons) {
          await ctx.reply(parsed.text, { reply_markup: ButtonParserService.toTelegram(parsed) });
        } else {
          await ctx.reply(response.content);
        }

        // 6. Salvar resposta da IA no histórico
        await HistoryService.addMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: response.content,
        });

      } catch (error) {
        console.error('❌ Erro no TelegramService:', error);
        await ctx.reply('Desculpe, tive um problema ao processar sua mensagem.');
      }
    });

    // Handler de callback (botões inline)
    this.bot.on('callback_query', async (ctx: any) => {
      try {
        const data = ctx.callbackQuery?.data;
        if (!data) return;
        await ctx.answerCbQuery(); // Remove loading do botão

        // Trata como mensagem do usuário
        const conversation = await HistoryService.getOrCreateConversation({
          tenantId: this.tenantId,
          agentId: this.agentId,
          channel: 'telegram',
          externalId: String(ctx.callbackQuery.from.id),
          metadata: { firstName: ctx.callbackQuery.from.first_name },
        });

        await HistoryService.addMessage({ conversationId: conversation.id, role: 'user', content: data });
        const context = await HistoryService.getRecentContext(conversation.id);
        const response = await AIService.complete(this.tenantId, this.agentId, context, undefined, 'telegram');

        const parsed = ButtonParserService.parse(response.content);
        if (parsed.hasButtons) {
          await ctx.reply(parsed.text, { reply_markup: ButtonParserService.toTelegram(parsed) });
        } else {
          await ctx.reply(response.content);
        }

        await HistoryService.addMessage({ conversationId: conversation.id, role: 'assistant', content: response.content });
      } catch (err) {
        console.error('❌ Erro callback Telegram:', err);
      }
    });
  }

  /**
   * Inicia o bot em modo Polling (útil para desenvolvimento/VPS)
   */
  async start() {
    try {
      this.bot.catch((err: any, ctx: any) => {
        console.error(`❌ Erro no Bot do Telegram (${this.agentId}):`, err);
        ctx.reply('Ocorreu um erro interno no bot.').catch(() => {});
      });

      await this.bot.launch();
      console.log(`🤖 Bot do Telegram iniciado para o Agente ${this.agentId}`);

      // Graceful stop
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    } catch (error: any) {
      console.error(`💥 Falha ao lançar Bot do Telegram para o Agente ${this.agentId}:`, error.message);
      throw error; // Propaga para o ChannelManager tratar localmente
    }
  }

  /**
   * Envia uma mensagem ativa (outbound)
   */
  async sendMessage(externalId: string, text: string) {
    return this.bot.telegram.sendMessage(externalId, text);
  }
}
