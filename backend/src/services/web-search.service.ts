import axios from 'axios';
import { env } from '../config/env.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchService {
  private static readonly BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

  static async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;

    if (!apiKey) {
      console.warn('⚠️ WebSearchService: BRAVE_SEARCH_API_KEY não configurada.');
      return [];
    }

    try {
      console.log(`🔍 [WEB_SEARCH] Buscando: "${query}" via Brave...`);
      const response = await axios.get(this.BRAVE_URL, {
        params: { q: query, count: limit },
        headers: {
          'X-Subscription-Token': apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const results = response.data.web?.results || [];
      return results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.description
      }));
    } catch (error: any) {
      console.error('❌ Erro na busca web:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Fallback para Perplexity via OpenRouter (se configurado)
   */
  static async searchPerplexity(query: string): Promise<string | null> {
    if (!env.OPENROUTER_API_KEY) return null;

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'perplexity/llama-3.1-sonar-small-128k-online',
          messages: [{ role: 'user', content: query }]
        },
        {
          headers: {
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('❌ Erro na busca Perplexity:', error);
      return null;
    }
  }
}
