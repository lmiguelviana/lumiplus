import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { KnowledgeService } from './knowledge.service.js';
import { settingsService } from './settings.service.js';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ApiOnboardingResult {
  handled: boolean;
  response?: string;
}

interface ParsedCredential {
  key: string;
  value: string;
  authHeader?: string;
  authScheme?: string;
}

export class ApiOnboardingService {
  static async maybeHandle(
    tenantId: string,
    agentId: string,
    messages: ChatMessage[]
  ): Promise<ApiOnboardingResult | null> {
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user' && message.content?.trim());

    if (!latestUserMessage) return null;

    const content = latestUserMessage.content.trim();
    if (!this.shouldHandle(content)) return null;

    const apiName = this.extractApiName(content);
    const slug = this.slugify(apiName);
    const urls = this.extractUrls(content);
    const credential = this.extractCredential(content, slug);
    const docsTitle = `[API DOCS] ${apiName}`;

    const docsContent = [
      `API: ${apiName}`,
      urls[0] ? `Endpoint/base identificado: ${urls[0]}` : '',
      credential?.key ? `Credencial salva: ${credential.key}` : 'Credencial: nao detectada automaticamente',
      credential?.authHeader ? `Header de autenticacao: ${credential.authHeader}` : '',
      credential?.authScheme ? `Esquema de autenticacao: ${credential.authScheme}` : '',
      '',
      'Documentacao original:',
      content,
    ].filter(Boolean).join('\n');

    try {
      const endpointConfig = this.extractEndpointConfig(urls[0] || null);

      if (credential?.value) {
        await settingsService.set(tenantId, credential.key, credential.value, true);
      }

      await KnowledgeService.save(tenantId, agentId, {
        title: docsTitle,
        content: docsContent,
      });

      await prisma.agentSkill.upsert({
        where: {
          agentId_skillId: {
            agentId,
            skillId: `custom:${slug}`,
          }
        },
        create: {
          tenantId,
          agentId,
          skillId: `custom:${slug}`,
          enabled: true,
          config: {
            apiName,
            credentialKey: credential?.key || `${slug}_api_key`,
            installedBy: 'api_onboarding',
            authHeader: credential?.authHeader || 'Authorization',
            authScheme: credential?.authScheme || 'Bearer',
            exampleUrl: urls[0] || null,
            baseUrl: endpointConfig?.baseUrl || null,
            defaultPath: endpointConfig?.defaultPath || null,
            docsTitle,
            type: 'custom_api',
          },
        },
        update: {
          enabled: true,
          config: {
            apiName,
            credentialKey: credential?.key || `${slug}_api_key`,
            installedBy: 'api_onboarding',
            authHeader: credential?.authHeader || 'Authorization',
            authScheme: credential?.authScheme || 'Bearer',
            exampleUrl: urls[0] || null,
            baseUrl: endpointConfig?.baseUrl || null,
            defaultPath: endpointConfig?.defaultPath || null,
            docsTitle,
            type: 'custom_api',
          },
        },
      });

      logger.info('ApiOnboarding', `API customizada registrada para agente ${agentId}: ${apiName}`);

      const lines = [
        `API "${apiName}" registrada com sucesso.`,
        credential?.value
          ? `Credencial salva no vault como "${credential.key}".`
          : 'Nao detectei uma credencial valida automaticamente; se quiser, envie a chave isolada na proxima mensagem.',
        `Documentacao salva no Knowledge Hub como "${docsTitle}".`,
        'Eu vou usar essa integracao via knowledge_search + call_api.',
      ];

      if (credential?.key) {
        const authPrefix = credential.authScheme ? `${credential.authScheme} ` : '';
        lines.push(`Header esperado: ${(credential.authHeader || 'Authorization')}: ${authPrefix}{{${credential.key}}}`);
      }

      if (urls[0]) {
        lines.push(`Endpoint/base identificado: ${urls[0]}`);
      }

      return {
        handled: true,
        response: lines.join('\n'),
      };
    } catch (error: any) {
      logger.error('ApiOnboarding', 'Falha ao registrar API customizada', error.message);
      return {
        handled: true,
        response: `Nao consegui concluir o cadastro automatico dessa API: ${error.message}`,
      };
    }
  }

  private static shouldHandle(content: string) {
    const lower = content.toLowerCase();
    const installIntent = /(instal|integr|configur|salv|registr|conect|adicion|documenta[cç][aã]o da api)/i.test(lower);
    const apiSignals = /(endpoint|authorization|bearer|api key|api_key|token|content-type|curl|https?:\/\/|acoes disponiveis|ações disponíveis|headers?|campos)/i.test(lower);
    const looksLikeDocs = content.length > 500 && /(endpoint|curl|authorization|content-type|https?:\/\/)/i.test(lower);

    return (installIntent && apiSignals) || looksLikeDocs;
  }

  private static extractApiName(content: string) {
    const explicitMatch =
      content.match(/documenta[cç][aã]o da api\s+([a-z0-9_-]+)/i) ||
      content.match(/\bapi\s+([a-z0-9_-]{3,})/i);

    if (explicitMatch?.[1]) {
      return this.humanize(explicitMatch[1]);
    }

    const firstUrl = this.extractUrls(content)[0];
    if (firstUrl) {
      try {
        const url = new URL(firstUrl);
        const lastSegment = url.pathname.split('/').filter(Boolean).pop();
        if (lastSegment) return this.humanize(lastSegment);
        return this.humanize(url.hostname.split('.')[0]);
      } catch {}
    }

    return 'Custom API';
  }

  private static extractUrls(content: string) {
    return Array.from(content.matchAll(/https?:\/\/[^\s"'`]+/gi)).map((match) => match[0]);
  }

  private static extractCredential(content: string, slug: string): ParsedCredential | null {
    const bearerMatch = content.match(/Authorization:\s*Bearer\s+([A-Za-z0-9._\-]+)/i);
    if (bearerMatch?.[1]) {
      return {
        key: `${slug}_api_key`,
        value: bearerMatch[1],
        authHeader: 'Authorization',
        authScheme: 'Bearer',
      };
    }

    const rawMatch =
      content.match(/\b([a-z0-9_-]+(?:api[_ -]?key|token|secret))\b\s*[:=]\s*["']?([A-Za-z0-9._\-]{12,})/i) ||
      content.match(/\b(token|api[_ -]?key|secret)\b[^A-Za-z0-9]+([A-Za-z0-9._\-]{12,})/i);

    if (!rawMatch?.[2]) return null;

    return {
      key: this.slugify(rawMatch[1] || `${slug}_api_key`).replace(/-/g, '_'),
      value: rawMatch[2],
    };
  }

  private static extractEndpointConfig(url: string | null) {
    if (!url) return null;

    try {
      const parsed = new URL(url);
      return {
        baseUrl: parsed.origin,
        defaultPath: parsed.pathname || '/',
      };
    } catch {
      return null;
    }
  }

  private static slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'custom-api';
  }

  private static humanize(value: string) {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }
}
