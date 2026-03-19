import axios from 'axios';
import FormData from 'form-data';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';


/**
 * TranscriptionService — Motor de conversão de Áudio para Texto.
 * Prioriza chaves do Tenant/Agente no Banco de Dados (BYOK).
 * @backend-specialist Principle: Seamless multimodal integration.
 */
export class TranscriptionService {
  private static readonly GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

  /**
   * Transcreve um buffer de áudio usando o motor Whisper via Groq.
   */
  static async transcribe(
    tenantId: string,
    agentId: string,
    audioBuffer: Buffer,
    fileName: string = 'audio.ogg'
  ): Promise<string> {
    const startTime = Date.now();
    const { settingsService } = await import('./settings.service.js');
    let apiKey = await settingsService.get(tenantId, 'groq_key');

    try {
      if (!apiKey) {
        throw new Error('Nenhuma chave GROQ configurada (Env ou DB).');
      }

      // 2. Preparar Payload Multiform/part
      const form = new FormData();
      form.append('file', audioBuffer, { filename: fileName });
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'json');

      // 3. Executar Transcrição
      const response = await axios.post(this.GROQ_AUDIO_URL, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${apiKey}`
        }
      });

      console.log(`🎙️ [WHISPER] Transcrição concluída em ${Date.now() - startTime}ms`);
      return response.data.text;

    } catch (error: any) {
      console.error('❌ Erro na transcrição Whisper/Groq:', error.response?.data || error.message);
      return '[ERRO NA TRANSCRIÇÃO DE ÁUDIO]';
    }
  }
}
