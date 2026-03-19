import axios from 'axios';
import { env } from '../config/env.js';
import { settingsService } from './settings.service.js';

/**
 * Serviço responsável por transformar texto em vetores numéricos (embeddings).
 * Essencial para busca semântica e RAG.
 */
export class EmbeddingService {
  private static readonly OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings';

  static async generate(tenantId: string, text: string): Promise<number[]> {
    try {
      const apiKey = await settingsService.get(tenantId, 'openrouter_key');
      
      const response = await axios.post(
        this.OPENROUTER_URL,
        {
          model: env.EMBEDDING_MODEL,
          input: text.replace(/\n/g, ' ') // Limpeza básica para otimizar embedding
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      // OpenRouter retorna o embedding no formato padrão de API da OpenAI
      return response.data.data[0].embedding;

    } catch (error: any) {
      console.error('❌ Erro ao gerar embedding:', error.response?.data || error.message);
      throw new Error('Falha na geração de representação vetorial');
    }
  }
}
