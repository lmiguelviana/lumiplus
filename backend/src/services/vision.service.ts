import axios from 'axios';
import { env } from '../config/env.js';

/**
 * VisionService — O "Olho" do Lumi Plus.
 * Utiliza GPT-4 Vision via OpenRouter para descrever conteúdos visuais.
 * @backend-specialist Principle: Multimodal awareness leads to better context.
 */
export class VisionService {
  private static readonly OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  /**
   * Analisa uma imagem e retorna uma descrição textual para ser usada como contexto.
   */
  static async analyze(
    tenantId: string,
    imageBuffer: Buffer, 
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    const startTime = Date.now();
    const base64Image = imageBuffer.toString('base64');
    const { settingsService } = await import('./settings.service.js');
    const apiKey = await settingsService.get(tenantId, 'openrouter_key');

    try {
      const response = await axios.post(
        this.OPENROUTER_URL,
        {
          model: 'openai/gpt-4o', // Modelo robusto para visão
          messages: [
            {
              role: 'user',
              content: [
                { 
                  type: 'text', 
                  text: 'Descreva detalhadamente esta imagem para um assistente de IA. Se houver texto, transcreva-o. Se for um documento ou comprovante, extraia os dados principais. Seja objetivo.' 
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`
                  }
                }
              ]
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://lumiplus.ai',
            'X-Title': 'Lumi Plus Vision Engine'
          },
          timeout: 45000
        }
      );

      const description = response.data.choices[0].message.content;
      console.log(`👁️ [VISION] Imagem analisada em ${Date.now() - startTime}ms`);
      return description;

    } catch (error: any) {
      console.error('❌ Erro no VisionService:', error.response?.data || error.message);
      return '[ERRO AO ANALISAR IMAGEM: O arquivo enviado não pôde ser interpretado pelo sensor visual.]';
    }
  }
}
