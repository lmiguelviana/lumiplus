import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  delay,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { AIService } from './ai.service.js';
import { HistoryService } from './history.service.js';
import { TranscriptionService } from './transcription.service.js';
import { VisionService } from './vision.service.js';
import { ButtonParserService } from './button-parser.service.js';
import { AccessControlService } from './access-control.service.js';
import { prisma } from '../lib/prisma.js';

import { EventEmitter } from 'events';

export class WhatsAppService extends EventEmitter {
  private sock: any;
  private authState: any;

  constructor(
    private tenantId: string,
    private agentId: string,
    private sessionName: string = 'lumiplus_session'
  ) {
    super();
  }

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState(`sessions/${this.sessionName}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`📡 Iniciando WhatsApp v${version.join('.')} (Última: ${isLatest})`);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }) as any,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`📱 QR Code gerado para ${this.sessionName}`);
        this.emit('qr', qr);
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('🔌 Conexão fechada:', this.sessionName, lastDisconnect?.error);
        this.emit('status', 'CLOSED');
        if (shouldReconnect) {
          this.start();
        }
      } else if (connection === 'open') {
        console.log('✅ Conexão aberta:', this.sessionName);
        this.emit('status', 'OPEN');
      }
    });

    this.sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const externalId = msg.key.remoteJid;
        let userText = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // --- SUPORTE A ÁUDIO (WHISPER) ---
        const isAudio = !!msg.message.audioMessage;
        if (isAudio) {
          console.log('🎙️ [WHATSAPP] Áudio detectado, iniciando processamento Whisper...');
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            userText = await TranscriptionService.transcribe(
              this.tenantId, 
              this.agentId, 
              buffer as Buffer,
              'audio.ogg'
            );
            console.log(`📝 [WHATSAPP] Voz transcrita: "${userText}"`);
          } catch (error) {
            console.error('❌ Erro ao baixar/transcrever áudio:', error);
          }
        }
        // ---------------------------------

        // --- SUPORTE A VISÃO (GPT-4 VISION) ---
        const isImage = !!msg.message.imageMessage;
        if (isImage) {
          console.log('👁️ [WHATSAPP] Imagem detectada, iniciando análise visual...');
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            const description = await VisionService.analyze(this.tenantId, buffer as Buffer);
            userText = `[SENSOR VISUAL ATIVADO: O usuário enviou uma imagem. Descrição: ${description}]`;
            console.log('✅ [WHATSAPP] Análise visual concluída e injetada no prompt.');
          } catch (error) {
            console.error('❌ Erro ao analisar imagem:', error);
          }
        }
        // --------------------------------------

        if (!userText) continue;

        const isGroup = externalId?.endsWith('@g.us') || false;
        const senderId = isGroup ? (msg.key.participant || externalId) : externalId;

        try {
          // --- FASE 29: CONTROLE DE ACESSO ---
          const access = await AccessControlService.checkAccess(this.agentId, senderId, 'whatsapp');
          if (access === 'blocked') continue; // Silêncio total
          if (access === 'pending') {
            await this.sock.sendMessage(externalId, { text: '🔒 Seu acesso está pendente de aprovação.' });
            continue;
          }

          // --- FASE 28: GRUPOS ---
          if (isGroup) {
            const agent = await prisma.agent.findUnique({ where: { id: this.agentId } });
            if (!agent) continue;

            const shouldRespond = AccessControlService.shouldRespondInGroup(agent, {
              text: userText,
              isGroup: true,
              agentName: agent.name,
              botJid: this.sock?.user?.id,
              quotedParticipant: msg.message?.extendedTextMessage?.contextInfo?.participant,
            });

            if (!shouldRespond) continue; // Não foi mencionado, ignora

            if (!AccessControlService.checkGroupCooldown(this.agentId, externalId, agent.groupCooldown || 5)) {
              continue; // Em cooldown, ignora
            }
          }

          // --- HANDLER DE APROVAÇÃO (intercepta antes dos comandos normais) ---
          if (userText.startsWith('/aprovar_') || userText.startsWith('/rejeitar_')) {
            const { handleApprovalCommand } = await import('./workflow-approval-notify.service.js');
            const reply = await handleApprovalCommand(userText);
            if (reply) { await this.sock.sendMessage(externalId, { text: reply }); continue; }
          }

          // --- HANDLER DE COMANDOS ---
          if (userText.startsWith('/')) {
            const { CommandService } = await import('./command.service.js');
            const commandResponse = await CommandService.handle(
              {
                id: msg.key.id!,
                channelType: 'whatsapp',
                channelId: externalId,
                senderId: externalId, // No WhatsApp o JID é o ID do remetente
                senderName: msg.pushName || 'Usuário',
                content: userText,
                isCommand: true
              },
              this.tenantId,
              true // Placeholder: assumindo que quem fala com o bot no WhatsApp agora é o dono
            );

            if (commandResponse) {
              await this.sock.sendMessage(externalId, { text: commandResponse });
              continue; // Interrompe o fluxo para comandos
            }
          }
          // ---------------------------

          // 1. Obter ou criar conversa
          const conversation = await HistoryService.getOrCreateConversation({
            tenantId: this.tenantId,
            agentId: this.agentId,
            channel: 'whatsapp',
            externalId,
            metadata: {
              pushName: msg.pushName
            },
          });

          // 2. Salvar mensagem do usuário
          await HistoryService.addMessage({
            conversationId: conversation.id,
            role: 'user',
            content: userText,
          });

          // 3. Recuperar contexto histórico
          const context = await HistoryService.getRecentContext(conversation.id);

          // 4. Chamar a IA
          const response = await AIService.complete(
            this.tenantId,
            this.agentId,
            context,
            undefined,
            'whatsapp'
          );

          // 5. Responder no WhatsApp (com botões se houver)
          const parsed = ButtonParserService.parse(response.content);
          if (parsed.hasButtons) {
            try {
              const waMsg = ButtonParserService.toWhatsApp(parsed);
              await this.sock.sendMessage(externalId, waMsg);
            } catch {
              // Fallback: texto numerado se botões falharem (Meta bloqueia em contas não-business)
              await this.sock.sendMessage(externalId, { text: ButtonParserService.toTextFallback(parsed) });
            }
          } else {
            await this.sock.sendMessage(externalId, { text: response.content });
          }

          // 6. Salvar resposta da IA no histórico
          await HistoryService.addMessage({
            conversationId: conversation.id,
            role: 'assistant',
            content: response.content,
          });

        } catch (error) {
          console.error('❌ Erro no WhatsAppService:', error);
        }
      }
    });
  }

  /**
   * Envia uma mensagem ativa
   */
  async sendMessage(to: string, text: string) {
    if (!this.sock) throw new Error('WhatsApp não inicializado');
    return this.sock.sendMessage(to, { text });
  }
}
