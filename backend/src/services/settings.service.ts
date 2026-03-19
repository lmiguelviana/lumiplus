import { prisma } from '../lib/prisma.js';
import { vaultService } from './vault.service.js';
import { env } from '../config/env.js';


export class SettingsService {
  /**
   * Lê uma configuração: banco primeiro, .env como fallback (compatibilidade)
   */
  async get(tenantId: string, key: string): Promise<string | null> {
    // 1. Tenta banco
    const row = await prisma.workspaceSetting.findUnique({
      where: {
        tenantId_key: {
          tenantId: tenantId,
          key: key
        }
      }
    });

    if (row) {
      return row.isSecret ? vaultService.decrypt(row.value) : row.value;
    }

    // 2. Fallback para .env (compatibilidade com instalações antigas)
    const envKey = `LUMI_${key.toUpperCase()}`;
    // Mapeamento direto para chaves conhecidas se não tiverem o prefixo LUMI_
    const knownKeys: Record<string, string> = {
      'openrouter_key': 'OPENROUTER_API_KEY',
      'openai_key': 'OPENAI_API_KEY',
      'anthropic_key': 'ANTHROPIC_API_KEY',
      'groq_key': 'GROQ_API_KEY',
      'brave_search_key': 'BRAVE_SEARCH_KEY',
    };

    const directEnvKey = knownKeys[key];
    
    // @ts-ignore
    return process.env[envKey] ?? (directEnvKey ? env[directEnvKey as keyof typeof env] ?? (process.env[directEnvKey]) : null) ?? null;
  }

  /**
   * Define ou atualiza uma configuração
   */
  async set(tenantId: string, key: string, value: string, isSecret = false): Promise<void> {
    const stored = isSecret ? vaultService.encrypt(value) : value;

    await prisma.workspaceSetting.upsert({
      where: {
        tenantId_key: {
          tenantId: tenantId,
          key: key
        }
      },
      create: {
        tenantId: tenantId,
        key: key,
        value: stored,
        isSecret: isSecret
      },
      update: {
        value: stored,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Lista todas as configurações do tenant (mascara os segredos)
   */
  async list(tenantId: string): Promise<Record<string, string>> {
    const rows = await prisma.workspaceSetting.findMany({
      where: { tenantId: tenantId }
    });

    const settingsObj = Object.fromEntries(
      rows.map((r: { key: string; isSecret: boolean; value: string }) => [
        r.key,
        r.isSecret ? '••••••••' : r.value  // nunca expõe secrets na listagem
      ])
    );
    
    // Adiciona placeholders informativos no frontend se a key estiver apenas no ENV
    const knownKeysToCheck = ['openrouter_key', 'groq_key', 'brave_search_key'];
    for(const k of knownKeysToCheck) {
        if(!settingsObj[k]) {
           const envValue = await this.get(tenantId, k);
           if(envValue) {
               settingsObj[k] = '•••••••• (Carregado do .env)';
           }
        }
    }

    return settingsObj;
  }
}

export const settingsService = new SettingsService();
