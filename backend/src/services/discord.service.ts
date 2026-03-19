import { Client, GatewayIntentBits, Partials, Message } from 'discord.js';
import { AIService } from './ai.service.js';
import { VisionService } from './vision.service.js';

/**
 * DiscordService — Conector para Servidores/Comunidades.
 * Permite que o Lumi Plus interaja nativamente com o Discord.
 * @backend-specialist Principle: Unified core, multiple entrypoints.
 */
export class DiscordService {
  private client: Client;

  constructor(
    private token: string,
    private tenantId: string,
    private agentId: string
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel] // Necessário para DMs
    });
  }

  async start() {
    this.client.once('ready', () => {
      console.log(`👾 [DISCORD] Bot online como: ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (message: Message) => {
      // Ignorar mensagens de bots
      if (message.author.bot) return;

      const isMentioned = message.mentions.has(this.client.user!.id);
      const isDM = !message.guild;

      // Responder apenas se for mencionado ou DM
      if (isMentioned || isDM) {
        await this.handleMessage(message);
      }
    });

    await this.client.login(this.token);
  }

  private async handleMessage(message: Message) {
    let userText = message.content.replace(/<@!\d+>/g, '').trim();
    const startTime = Date.now();

    try {
      // 1. Mostrar que está digitando
      if ('sendTyping' in message.channel) {
        await (message.channel as any).sendTyping();
      }

      // 2. Verificação de Imagem (Multimodalidade Vision)
      const attachment = message.attachments.first();
      if (attachment && attachment.contentType?.startsWith('image/')) {
        console.log('👁️ [DISCORD] Imagem detectada via Discord, analisando...');
        try {
          const response = await fetch(attachment.url);
          const buffer = Buffer.from(await response.arrayBuffer());
          const description = await VisionService.analyze(this.tenantId, buffer);
          userText = `[SENSOR VISUAL DISCORD: O usuário enviou uma imagem. Descrição: ${description}]\n\n${userText}`;
        } catch (visionErr) {
          console.error('❌ Erro na visão do Discord:', visionErr);
        }
      }

      if (!userText && !attachment) return;

      // 3. Processar via AIService (Cérebro Unificado)
      const response = await AIService.complete(
        this.tenantId,
        this.agentId,
        [{ role: 'user', content: userText }],
        []
      );

      // 4. Enviar Resposta
      await message.reply(response.content);
      console.log(`✅ [DISCORD] Resposta enviada em ${Date.now() - startTime}ms`);

    } catch (error) {
      console.error('❌ Erro no DiscordService:', error);
      await message.reply('⚠️ [ERRO DE PROTOCOLO]: Meus sistemas neurais no Discord falharam momentaneamente.');
    }
  }
}
