/**
 * SkillRegistry — gerencia skills ativas por agente.
 * Retorna tools dinâmicas e executa handlers.
 */

import { prisma } from '../../lib/prisma.js';
import { SKILL_CATALOG, DEFAULT_SKILLS } from './catalog.js';
import { KnowledgeService } from '../knowledge.service.js';
import { logger } from '../../lib/logger.js';
import { containsTextFilter, fromDbJson, toDbJson } from '../../lib/db-compat.js';

interface SkillContext {
  tenantId: string;
  agentId: string;
  credentials: Record<string, string>;
  runtime?: {
    channel?: string;
    externalId?: string;
    conversationId?: string;
    contactId?: string;
    sourceAgentId?: string;
  };
}

interface AsyncSkillExecution {
  __asyncExecution: true;
  content: string;
  metadata: {
    type: 'squad_triggered' | 'workflow_triggered';
    runId: string;
    squadId?: string | null;
    workflowId?: string | null;
  };
}

interface CustomApiConfig {
  apiName?: string;
  credentialKey?: string;
  authHeader?: string;
  authScheme?: string;
  exampleUrl?: string | null;
  baseUrl?: string | null;
  defaultPath?: string | null;
  docsTitle?: string;
  type?: string;
}

function parseWorkflowJson<T>(value: unknown, fallback: T): T {
  return fromDbJson(value, fallback);
}

function parseSkillConfig<T extends Record<string, any> = Record<string, any>>(value: unknown): T {
  return fromDbJson<T>(value, {} as T);
}

function extractWorkflowAgentId(trigger: unknown): string | null {
  const parsedTrigger = parseWorkflowJson<Record<string, any>>(trigger, {});
  const agentId = parsedTrigger?.agentId ?? parsedTrigger?.config?.agentId;
  return typeof agentId === 'string' && agentId.trim() ? agentId.trim() : null;
}

function workflowMatchesAgent(
  workflow: { name?: string | null; description?: string | null; trigger?: unknown },
  agentId: string,
  agentName?: string | null
) {
  const workflowAgentId = extractWorkflowAgentId(workflow.trigger);
  if (workflowAgentId) return workflowAgentId === agentId;
  if (!agentName) return false;

  const text = `${workflow.name || ''} ${workflow.description || ''}`.toLowerCase();
  return text.includes(agentName.toLowerCase());
}

export class SkillRegistry {
  private static async hasLedSquad(tenantId: string, agentId: string): Promise<boolean> {
    const squadMembership = await prisma.squadMember.findFirst({
      where: {
        agentId,
        role: 'leader',
        squad: { tenantId },
      },
      select: { id: true },
    });

    return !!squadMembership;
  }

  private static async getAgentWorkflowNames(tenantId: string, agentId: string): Promise<string[]> {
    const [agent, workflows] = await Promise.all([
      prisma.agent.findFirst({
        where: { id: agentId, tenantId },
        select: { name: true },
      }),
      prisma.workflow.findMany({
        where: {
          tenantId,
          status: 'active',
        },
        select: {
          name: true,
          description: true,
          trigger: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    const names = workflows
      .filter((workflow) => workflowMatchesAgent(workflow, agentId, agent?.name))
      .map((workflow) => workflow.name?.trim())
      .filter((name): name is string => Boolean(name));

    return [...new Set(names)];
  }

  private static async hasAgentWorkflow(tenantId: string, agentId: string): Promise<boolean> {
    const names = await this.getAgentWorkflowNames(tenantId, agentId);
    return names.length > 0;
  }

  private static async getEffectiveSkillIds(tenantId: string, agentId: string): Promise<string[]> {
    const activeSkills = await this.getActiveSkillIds(tenantId, agentId);
    const effectiveSkills = [...activeSkills];

    if (!effectiveSkills.includes('run_squad') && await this.hasLedSquad(tenantId, agentId)) {
      effectiveSkills.push('run_squad');
    }

    if (!effectiveSkills.includes('run_workflow') && await this.hasAgentWorkflow(tenantId, agentId)) {
      effectiveSkills.push('run_workflow');
    }

    return effectiveSkills;
  }

  private static async getSquadPromptAddition(tenantId: string, agentId: string): Promise<string> {
    const ledSquads = await prisma.squad.findMany({
      where: {
        tenantId,
        members: {
          some: {
            agentId,
            role: 'leader',
          },
        },
      },
      select: { name: true },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    });

    if (ledSquads.length === 0) return '';

    const squadNames = ledSquads.map((squad) => `"${squad.name}"`).join(', ');
    return `Voce tem acesso direto as squads que lidera neste workspace. Squads disponiveis agora: ${squadNames}. Se o usuario perguntar se voce consegue acessar sua squad, sua equipe ou seus especialistas, responda que sim e cite os nomes disponiveis. Quando o usuario pedir para usar sua equipe, sua squad ou os especialistas, use run_squad em vez de responder que nao tem acesso.`;
  }

  private static async getWorkflowPromptAddition(tenantId: string, agentId: string): Promise<string> {
    const workflowNames = await this.getAgentWorkflowNames(tenantId, agentId);
    if (workflowNames.length === 0) return '';

    const visibleNames = workflowNames.slice(0, 5).map((name) => `"${name}"`).join(', ');
    return `Voce tem acesso direto aos workflows deste agente no canvas visual. Workflows disponiveis agora: ${visibleNames}. Se o usuario perguntar se voce consegue acessar, abrir, usar ou disparar seus workflows, responda que sim e cite os nomes disponiveis. Quando o usuario pedir para executar um workflow seu, use run_workflow em vez de responder que nao tem acesso.`;
  }

  /** Retorna tools ativas de um agente (para passar ao AIService) */
  static async getActiveTools(tenantId: string, agentId: string) {
    const activeSkills = await this.getEffectiveSkillIds(tenantId, agentId);
    const catalogTools = activeSkills
      .map(id => SKILL_CATALOG[id]?.tool)
      .filter(Boolean);
    const customTools = await this.getCustomApiTools(tenantId, agentId);
    return [...catalogTools, ...customTools];
  }

  /** Retorna adições ao system prompt de skills ativas */
  static async getSystemPromptAdditions(tenantId: string, agentId: string) {
    const activeSkills = await this.getEffectiveSkillIds(tenantId, agentId);
    const catalogAdditions = activeSkills
      .map(id => SKILL_CATALOG[id]?.systemPromptAddition)
      .filter(Boolean)
    ;
    const customAdditions = await this.getCustomSkillPromptAdditions(tenantId, agentId);
    const squadAddition = await this.getSquadPromptAddition(tenantId, agentId);
    const workflowAddition = await this.getWorkflowPromptAddition(tenantId, agentId);
    return [...catalogAdditions, ...customAdditions, squadAddition, workflowAddition].filter(Boolean).join('\n\n');
  }

  /** IDs das skills ativas */
  static async getActiveSkillIds(tenantId: string, agentId: string): Promise<string[]> {
    try {
      const skills = await prisma.agentSkill.findMany({
        where: { tenantId, agentId, enabled: true },
      });

      if (skills.length === 0) {
        // Agente novo ou sem skills: ativa todas as padrão
        logger.info('SkillRegistry', `Auto-ativando ${DEFAULT_SKILLS.length} skills padrão para agente ${agentId}`);
        await this.activateDefaults(tenantId, agentId);
        return DEFAULT_SKILLS;
      }

      // Verifica se há novas skills padrão que o agente ainda não tem
      const activeIds = skills.map(s => s.skillId);
      const missing = DEFAULT_SKILLS.filter(id => !activeIds.includes(id));
      if (missing.length > 0) {
        logger.info('SkillRegistry', `Adicionando ${missing.length} nova(s) skill(s) padrão ao agente ${agentId}: ${missing.join(', ')}`);
        for (const skillId of missing) {
          await prisma.agentSkill.upsert({
            where: { agentId_skillId: { agentId, skillId } },
            create: { tenantId, agentId, skillId, enabled: true, config: toDbJson({}) },
            update: { enabled: true },
          }).catch(() => {});
        }
        activeIds.push(...missing);
      }

      return activeIds;
    } catch {}
    return DEFAULT_SKILLS;
  }

  /** Ativa skills padrão para um novo agente */
  static async activateDefaults(tenantId: string, agentId: string) {
    for (const skillId of DEFAULT_SKILLS) {
      await prisma.agentSkill.upsert({
        where: { agentId_skillId: { agentId, skillId } },
        create: { tenantId, agentId, skillId, enabled: true, config: toDbJson({}) },
        update: { enabled: true },
      }).catch(() => {});
    }
  }

  /** Ativa uma skill para um agente */
  static async activate(tenantId: string, agentId: string, skillId: string, config: any = {}) {
    if (skillId.startsWith('custom:')) {
      const existing = await prisma.agentSkill.findFirst({
        where: { tenantId, agentId, skillId },
      });

      if (!existing && Object.keys(config || {}).length === 0) {
        throw new Error(`Integracao customizada "${skillId}" nao encontrada para este agente`);
      }

      return prisma.agentSkill.upsert({
        where: { agentId_skillId: { agentId, skillId } },
        create: { tenantId, agentId, skillId, enabled: true, config: toDbJson(config) },
        update: {
          enabled: true,
          config: Object.keys(config || {}).length > 0 ? toDbJson(config) : existing?.config || toDbJson({}),
        },
      });
    }

    if (!SKILL_CATALOG[skillId]) throw new Error(`Skill "${skillId}" não existe no catálogo`);
    return prisma.agentSkill.upsert({
      where: { agentId_skillId: { agentId, skillId } },
      create: { tenantId, agentId, skillId, enabled: true, config: toDbJson(config) },
      update: { enabled: true, config: toDbJson(config) },
    });
  }

  /** Desativa uma skill */
  static async deactivate(agentId: string, skillId: string) {
    return prisma.agentSkill.updateMany({
      where: { agentId, skillId },
      data: { enabled: false },
    });
  }

  /** Executa handler de uma skill */
  static async execute(skillId: string, args: any, context: SkillContext): Promise<string | AsyncSkillExecution> {
    if (skillId.startsWith('custom_api_')) {
      return this.executeCustomApiTool(skillId, args, context);
    }

    const skillDefinition = Object.values(SKILL_CATALOG).find((skill) =>
      skill.id === skillId || skill.tool.function.name === skillId
    );
    if (skillDefinition?.credentials?.length) {
      const { settingsService } = await import('../settings.service.js');
      const loadedCredentials = { ...context.credentials };

      for (const credential of skillDefinition.credentials) {
        if (!loadedCredentials[credential.key]) {
          const value = await settingsService.get(context.tenantId, credential.key);
          if (value) loadedCredentials[credential.key] = value;
        }
      }

      context = { ...context, credentials: loadedCredentials };
    }

    const handler = SKILL_HANDLERS[skillId];
    if (handler) return handler(args, context);

    // Fallback: handler genérico
    return `Skill "${skillId}" não tem handler implementado ainda.`;
  }

  private static async getCustomSkillPromptAdditions(tenantId: string, agentId: string): Promise<string[]> {
    try {
      const customSkills = await prisma.agentSkill.findMany({
        where: {
          tenantId,
          agentId,
          enabled: true,
          skillId: { startsWith: 'custom:' },
        },
      });

      return customSkills.map((skill) => {
        const config = parseSkillConfig(skill.config);
        const apiName = String(config.apiName || skill.skillId.replace(/^custom:/, '').replace(/[_-]/g, ' '));
        const credentialKey = String(config.credentialKey || skill.skillId.replace(/^custom:/, '').replace(/-/g, '_'));
        const authHeader = String(config.authHeader || 'Authorization');
        const authPrefix = config.authScheme ? `${String(config.authScheme)} ` : '';
        const exampleUrl = config.exampleUrl ? ` Endpoint/base conhecido: ${String(config.exampleUrl)}.` : '';
        const docsTitle = config.docsTitle ? ` Procure a documentacao em knowledge_search usando "${String(config.docsTitle)}".` : '';
        const toolName = this.toCustomToolName(skill.skillId);

        return `API personalizada configurada: ${apiName}.${exampleUrl}${docsTitle} Para usar esta integracao, utilize a tool \`${toolName}\`. Envie SEMPRE o payload da requisicao (parametros, acoes, JSON) no atributo \`body\`. O valor da credencial nunca deve ser adivinhado, use EXATAMENTE a string \`{{${credentialKey}}}\` no header da tool.`;
      });
    } catch {
      return [];
    }
  }

  private static async getCustomApiTools(tenantId: string, agentId: string) {
    try {
      const customSkills = await prisma.agentSkill.findMany({
        where: {
          tenantId,
          agentId,
          enabled: true,
          skillId: { startsWith: 'custom:' },
        },
      });

      return customSkills
        .filter((skill) => {
          const config = parseSkillConfig<CustomApiConfig>(skill.config);
          return (config.type || 'custom_api') === 'custom_api';
        })
        .map((skill) => {
          const config = parseSkillConfig<CustomApiConfig>(skill.config);
          const apiName = String(config.apiName || skill.skillId.replace(/^custom:/, '').replace(/[_-]/g, ' '));
          const toolName = this.toCustomToolName(skill.skillId);
          const defaultPath = config.defaultPath || '/';
          const baseUrl = config.baseUrl || config.exampleUrl || '';

          return {
            type: 'function' as const,
            function: {
              name: toolName,
              description: `Executa operacoes na API personalizada ${apiName}. Base conhecida: ${baseUrl || 'nao definida'}. Caminho padrao: ${defaultPath}.`,
              parameters: {
                type: 'object',
                properties: {
                  method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                    description: 'Metodo HTTP da chamada',
                  },
                  path: {
                    type: 'string',
                    description: `Path relativo da rota. Use "${defaultPath}" como base quando fizer sentido.`,
                  },
                  url: {
                    type: 'string',
                    description: 'URL absoluta opcional. Se omitida, o sistema monta a URL com baseUrl + path.',
                  },
                  headers: {
                    type: 'object',
                    description: 'Headers extras alem da autenticacao automatica.',
                  },
                  query: {
                    type: 'object',
                    description: 'Query string em formato chave/valor.',
                    additionalProperties: true,
                  },
                  body: {
                    type: 'object',
                    description: 'Payload JSON da chamada. OBRIGATÓRIO para POST/PUT (ex: passe {"action":"list_gallery"} aqui).',
                    additionalProperties: true,
                  },
                },
                required: ['method', 'path', 'body'],
              },
            },
          };
        });
    } catch {
      return [];
    }
  }

  private static async executeCustomApiTool(
    skillId: string,
    args: any,
    context: SkillContext
  ): Promise<string | AsyncSkillExecution> {
    const customSkillId = this.fromCustomToolName(skillId);
    const customSkill = await prisma.agentSkill.findFirst({
      where: {
        tenantId: context.tenantId,
        agentId: context.agentId,
        skillId: customSkillId,
        enabled: true,
      },
    });

    if (!customSkill) {
      return `Integracao customizada "${skillId}" nao encontrada para este agente.`;
    }

    const config = parseSkillConfig<CustomApiConfig>(customSkill.config);
    const credentialKey = String(config.credentialKey || customSkillId.replace(/^custom:/, '').replace(/-/g, '_'));
    const authHeader = String(config.authHeader || 'Authorization');
    const authScheme = config.authScheme ? `${String(config.authScheme)} ` : '';
    const baseUrl = String(config.baseUrl || '');
    const defaultPath = String(config.defaultPath || '/');
    const path = String(args.path || defaultPath);
    const url = args.url ? String(args.url) : buildCustomApiUrl(baseUrl, path, args.query);

    const headers = {
      ...(args.headers || {}),
      [authHeader]: `${authScheme}{{${credentialKey}}}`,
    };

    return SKILL_HANDLERS.call_api({
      method: String(args.method || 'GET').toUpperCase(),
      url,
      headers,
      body: args.body,
    }, context);
  }

  private static toCustomToolName(skillId: string) {
    return `custom_api_${skillId.replace(/^custom:/, '').replace(/[^a-zA-Z0-9_]/g, '_')}`;
  }

  private static fromCustomToolName(toolName: string) {
    return `custom:${toolName.replace(/^custom_api_/, '').replace(/_/g, '-')}`;
  }
}

function buildCustomApiUrl(baseUrl: string, path: string, query?: Record<string, unknown>) {
  if (!baseUrl) return path;

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function resolveCredentialPlaceholders(value: unknown, tenantId: string): Promise<unknown> {
  if (typeof value === 'string') {
    // Suporta {{chave}} (padrão técnico) e {chave} (formato natural do LLM)
    const matches = Array.from(value.matchAll(/\{\{([a-z0-9_]+)\}\}|\{([a-z0-9_]+)\}/gi));
    if (matches.length === 0) return value;

    let resolved = value;
    const { settingsService } = await import('../settings.service.js');

    for (const match of matches) {
      const key = match[1] || match[2]; // match[1] = {{key}}, match[2] = {key}
      const secret = await settingsService.get(tenantId, key);
      if (!secret) {
        throw new Error(`Credencial "${key}" não configurada. Vá em Configurações e adicione a chave "${key}".`);
      }
      resolved = resolved.replace(match[0], secret);
    }

    return resolved;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveCredentialPlaceholders(item, tenantId)));
  }

  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([key, entryValue]) => [
        key,
        await resolveCredentialPlaceholders(entryValue, tenantId)
      ] as const)
    );
    return Object.fromEntries(entries);
  }

  return value;
}

// ── Handlers de Skills ──

function buildServiceUrl(baseUrl: string, path: string, query?: Record<string, unknown>) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function stringifyServiceResponse(data: unknown) {
  if (typeof data === 'string') return data.slice(0, 4000);
  return JSON.stringify(data, null, 2).slice(0, 4000);
}

async function runHttpIntegration(options: {
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  apiKey: string;
  body?: unknown;
  query?: Record<string, unknown>;
}) {
  const url = buildServiceUrl(options.baseUrl, options.path, options.query);
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    apikey: options.apiKey,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(20000),
  };

  if (options.body !== undefined && options.body !== null && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const details = stringifyServiceResponse(data || response.statusText || 'erro desconhecido');
    throw new Error(`${response.status} ${response.statusText}: ${details}`);
  }

  return `Status: ${response.status} ${response.statusText}\n\nResposta:\n${stringifyServiceResponse(data)}`;
}

function normalizeWhatsappNumber(value: unknown) {
  const digits = String(value || '').replace(/\D+/g, '').trim();
  if (!digits) return '';

  // Heuristica local: quando o usuario informa um numero brasileiro sem DDI,
  // prefixamos 55 para reduzir falhas operacionais no WhatsApp.
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }

  return digits;
}

function normalizeGroupJid(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.endsWith('@g.us')) return raw;

  const compact = raw.replace(/\s+/g, '');
  if (/^[0-9-]+$/.test(compact)) {
    return `${compact}@g.us`;
  }

  return raw;
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function pickFirstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateAtWordBoundary(value: string, maxLength: number) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength + 1);
  const boundary = sliced.lastIndexOf(' ');
  return (boundary > 24 ? sliced.slice(0, boundary) : normalized.slice(0, maxLength)).trim();
}

function extractHtmlTag(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return normalizeText(match?.[1] || '');
}

function extractHtmlTagFallback(html: string, ...patterns: RegExp[]) {
  for (const pattern of patterns) {
    const value = extractHtmlTag(html, pattern);
    if (value) return value;
  }

  return '';
}

function extractPageMeta(html: string) {
  return {
    title: extractHtmlTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: extractHtmlTagFallback(
      html,
      /<meta[^>]*(?:name|property)=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']description["'][^>]*>/i
    ),
    ogTitle: extractHtmlTag(
      html,
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ),
    ogDescription: extractHtmlTag(
      html,
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ),
    ogImage: extractHtmlTag(
      html,
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ),
    twitterCard: extractHtmlTag(
      html,
      /<meta[^>]*name=["']twitter:card["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ),
    twitterTitle: extractHtmlTag(
      html,
      /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ),
    twitterDescription: extractHtmlTag(
      html,
      /<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ),
  };
}

async function fetchPageMeta(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LumiPlusBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Falha ao acessar URL informada (${response.status} ${response.statusText})`);
  }

  const html = await response.text();
  return extractPageMeta(html);
}

function buildTitleOptions(params: {
  primaryKeyword: string;
  valueProp: string;
  brandName: string;
  pageType: string;
}) {
  const year = new Date().getFullYear();
  const keyword = truncateAtWordBoundary(params.primaryKeyword, 28);
  const value = truncateAtWordBoundary(params.valueProp || 'Resultado real e aplicavel', 34);
  const brandSuffix = params.brandName ? ` | ${truncateAtWordBoundary(params.brandName, 16)}` : '';
  const typeHint = params.pageType === 'product' ? 'Comprar' : params.pageType === 'service' ? 'Servico' : 'Guia';

  return [
    truncateAtWordBoundary(`${keyword}: ${value}${brandSuffix}`, 60),
    truncateAtWordBoundary(`${typeHint} de ${keyword}${brandSuffix}`, 60),
    truncateAtWordBoundary(`${keyword} em ${year}: ${value}`, 60),
  ].filter(Boolean);
}

function buildDescriptionOptions(params: {
  primaryKeyword: string;
  targetAudience: string;
  primaryCta: string;
  valueProp: string;
  secondaryKeywords: string[];
}) {
  const keyword = truncateAtWordBoundary(params.primaryKeyword, 28);
  const audience = truncateAtWordBoundary(params.targetAudience || 'quem busca essa solucao', 36);
  const cta = truncateAtWordBoundary(params.primaryCta || 'Saiba mais agora', 32);
  const value = truncateAtWordBoundary(params.valueProp || 'beneficios claros e aplicaveis', 52);
  const secondary = params.secondaryKeywords.length > 0
    ? ` Inclui ${truncateAtWordBoundary(params.secondaryKeywords.slice(0, 2).join(' e '), 42)}.`
    : '';

  return [
    truncateAtWordBoundary(`${keyword} para ${audience}. ${value}. ${cta}.${secondary}`, 160),
    truncateAtWordBoundary(`Descubra ${keyword} com foco em ${value}. Ideal para ${audience}. ${cta}.`, 160),
    truncateAtWordBoundary(`${keyword}: veja como aplicar, comparar e decidir melhor. ${value}. ${cta}.`, 160),
  ].filter(Boolean);
}

function buildMetaTagsBlock(params: {
  title: string;
  description: string;
  url: string;
  canonicalUrl: string;
  ogImageUrl: string;
  pageType: string;
}) {
  const url = params.url || params.canonicalUrl || '';
  const canonical = params.canonicalUrl || params.url || '';
  const ogType = params.pageType === 'article' || params.pageType === 'blog' ? 'article' : 'website';
  const twitterCard = params.ogImageUrl ? 'summary_large_image' : 'summary';

  const lines = [
    `<title>${params.title}</title>`,
    `<meta name="description" content="${params.description}">`,
    canonical ? `<link rel="canonical" href="${canonical}">` : '',
    `<meta property="og:type" content="${ogType}">`,
    url ? `<meta property="og:url" content="${url}">` : '',
    `<meta property="og:title" content="${params.title}">`,
    `<meta property="og:description" content="${params.description}">`,
    params.ogImageUrl ? `<meta property="og:image" content="${params.ogImageUrl}">` : '',
    `<meta name="twitter:card" content="${twitterCard}">`,
    `<meta name="twitter:title" content="${params.title}">`,
    `<meta name="twitter:description" content="${params.description}">`,
    params.ogImageUrl ? `<meta name="twitter:image" content="${params.ogImageUrl}">` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

function normalizeMetaAdAccountId(value: unknown) {
  const accountId = String(value || '').replace(/^act_/, '').trim();
  return accountId ? `act_${accountId}` : '';
}

function buildMetaGraphUrl(path: string, query?: Record<string, unknown>) {
  const baseUrl = 'https://graph.facebook.com/v25.0';
  return buildServiceUrl(baseUrl, path, query);
}

async function runMetaGraphRequest(options: {
  path: string;
  accessToken: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}) {
  const url = buildMetaGraphUrl(options.path, options.query);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
  };
  const method = options.method || 'GET';
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(20000),
  };

  if (options.body && method !== 'GET') {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(options.body)) {
      if (value === undefined || value === null || value === '') continue;
      if (typeof value === 'object') {
        formData.set(key, JSON.stringify(value));
      } else {
        formData.set(key, String(value));
      }
    }

    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = formData.toString();
  }

  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    const message = data?.error?.message || response.statusText || 'erro desconhecido';
    throw new Error(message);
  }

  return data;
}

const SKILL_HANDLERS: Record<string, (args: any, ctx: SkillContext) => Promise<string | AsyncSkillExecution>> = {

  upload_image: async (args, ctx) => {
    const apiKey = ctx.credentials.imgbb_api_key;
    if (!apiKey) return 'ImgBB API Key nao configurada.';

    const imageBase64 = String(args.image_base64 || '').trim();
    if (!imageBase64) return 'image_base64 e obrigatorio.';

    const normalizedBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const formData = new FormData();
    formData.set('key', apiKey);
    formData.set('image', normalizedBase64);
    if (args.filename) formData.set('name', String(args.filename));

    try {
      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.data?.url) {
        return `Erro ao fazer upload da imagem: ${data?.error?.message || response.statusText || 'falha desconhecida'}`;
      }

      return JSON.stringify({
        url: data.data.url,
        delete_url: data.data.delete_url,
        width: data.data.width,
        height: data.data.height,
      });
    } catch (error: any) {
      return `Erro ao fazer upload da imagem: ${error.message}`;
    }
  },

  instagram_publish: async (args, ctx) => {
    const accessToken = ctx.credentials.instagram_access_token;
    const userId = ctx.credentials.instagram_user_id;
    if (!accessToken || !userId) {
      return 'Credenciais do Instagram nao configuradas. Salve instagram_access_token e instagram_user_id.';
    }

    const type = String(args.type || '').trim();
    const caption = String(args.caption || '').trim();
    const imageUrls = Array.isArray(args.image_urls)
      ? args.image_urls.map((url: unknown) => String(url || '').trim()).filter(Boolean)
      : [];

    if (!type || !caption || imageUrls.length === 0) {
      return 'Campos obrigatorios: type, caption e image_urls.';
    }

    if (!['post', 'carousel', 'story'].includes(type)) {
      return `Tipo "${type}" nao suportado. Use post, carousel ou story.`;
    }

    const baseUrl = 'https://graph.facebook.com/v21.0';

    async function graphRequest(path: string, payload: Record<string, unknown>) {
      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null) {
          formData.set(key, String(value));
        }
      }

      const response = await fetch(`${baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        const errorMessage = data?.error?.message || response.statusText || 'erro desconhecido';
        throw new Error(errorMessage);
      }

      return data;
    }

    try {
      if (type === 'story') {
        if (imageUrls.length !== 1) return 'Story exige exatamente 1 image_url.';

        const createRes = await graphRequest(`${userId}/media`, {
          media_type: 'STORIES',
          image_url: imageUrls[0],
          access_token: accessToken,
        });

        const publishRes = await graphRequest(`${userId}/media_publish`, {
          creation_id: createRes.id,
          access_token: accessToken,
        });

        return `Story publicada com sucesso no Instagram. Media ID: ${publishRes.id}`;
      }

      if (type === 'post') {
        if (imageUrls.length !== 1) return 'Post simples exige exatamente 1 image_url.';

        const createRes = await graphRequest(`${userId}/media`, {
          image_url: imageUrls[0],
          caption,
          access_token: accessToken,
        });

        const publishRes = await graphRequest(`${userId}/media_publish`, {
          creation_id: createRes.id,
          access_token: accessToken,
        });

        return `Post publicado com sucesso no Instagram. Media ID: ${publishRes.id}`;
      }

      if (imageUrls.length < 2 || imageUrls.length > 10) {
        return 'Carrossel exige entre 2 e 10 image_urls.';
      }

      const containerIds: string[] = [];
      for (const imageUrl of imageUrls) {
        const mediaRes = await graphRequest(`${userId}/media`, {
          image_url: imageUrl,
          is_carousel_item: 'true',
          access_token: accessToken,
        });
        if (!mediaRes?.id) throw new Error('Falha ao criar container do item do carrossel.');
        containerIds.push(mediaRes.id);
      }

      const carouselRes = await graphRequest(`${userId}/media`, {
        media_type: 'CAROUSEL',
        children: containerIds.join(','),
        caption,
        access_token: accessToken,
      });

      const publishRes = await graphRequest(`${userId}/media_publish`, {
        creation_id: carouselRes.id,
        access_token: accessToken,
      });

      return `Carrossel publicado com sucesso no Instagram com ${containerIds.length} imagens. Media ID: ${publishRes.id}`;
    } catch (error: any) {
      logger.error('instagram_publish', 'Falha ao publicar no Instagram', error.message);
      return `Erro ao publicar no Instagram: ${error.message}`;
    }
  },

  // ── Send Buttons: retorna texto com marcação de botões ──
  meta_tags_optimizer: async (args) => {
    const primaryKeyword = normalizeText(args.primary_keyword);
    if (!primaryKeyword) {
      return 'primary_keyword e obrigatorio para gerar tags otimizadas.';
    }

    const url = normalizeText(args.url);
    const pageType = normalizeText(args.page_type || 'other') || 'other';
    const secondaryKeywords = Array.isArray(args.secondary_keywords)
      ? args.secondary_keywords.map((keyword: unknown) => normalizeText(keyword)).filter(Boolean)
      : normalizeText(args.secondary_keywords)
        .split(',')
        .map((keyword) => normalizeText(keyword))
        .filter(Boolean);

    let currentMeta = {
      title: normalizeText(args.current_title),
      description: normalizeText(args.current_description),
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      twitterCard: '',
      twitterTitle: '',
      twitterDescription: '',
    };

    if (url) {
      try {
        currentMeta = await fetchPageMeta(url);
      } catch (error: any) {
        logger.warn('meta_tags_optimizer', `Nao foi possivel ler a URL ${url}: ${error.message}`);
      }
    }

    if (!currentMeta.title) currentMeta.title = normalizeText(args.current_title);
    if (!currentMeta.description) currentMeta.description = normalizeText(args.current_description);

    const targetAudience = normalizeText(args.target_audience || 'quem busca essa solucao');
    const primaryCta = normalizeText(args.primary_cta || 'Saiba mais agora');
    const valueProp = normalizeText(args.unique_value_prop || args.content_summary || 'beneficios claros e aplicaveis');
    const brandName = normalizeText(args.brand_name);
    const ogImageUrl = normalizeText(args.og_image_url || currentMeta.ogImage);
    const canonicalUrl = normalizeText(args.canonical_url || url);

    const titleOptions = buildTitleOptions({
      primaryKeyword,
      valueProp,
      brandName,
      pageType,
    });
    const descriptionOptions = buildDescriptionOptions({
      primaryKeyword,
      targetAudience,
      primaryCta,
      valueProp,
      secondaryKeywords,
    });

    const recommendedTitle = titleOptions[0] || primaryKeyword;
    const recommendedDescription = descriptionOptions[0] || valueProp;
    const metaBlock = buildMetaTagsBlock({
      title: recommendedTitle,
      description: recommendedDescription,
      url,
      canonicalUrl,
      ogImageUrl,
      pageType,
    });

    const currentTags = [
      currentMeta.title ? `- Title atual: ${currentMeta.title}` : '',
      currentMeta.description ? `- Description atual: ${currentMeta.description}` : '',
      currentMeta.ogTitle ? `- OG Title atual: ${currentMeta.ogTitle}` : '',
      currentMeta.ogDescription ? `- OG Description atual: ${currentMeta.ogDescription}` : '',
      currentMeta.twitterTitle ? `- Twitter Title atual: ${currentMeta.twitterTitle}` : '',
      currentMeta.twitterDescription ? `- Twitter Description atual: ${currentMeta.twitterDescription}` : '',
    ].filter(Boolean);

    const titleLines = titleOptions.map((title, index) => `${index + 1}. ${title} (${title.length} chars)`);
    const descriptionLines = descriptionOptions.map((description, index) => `${index + 1}. ${description} (${description.length} chars)`);

    return [
      `Otimizacao SEO concluida para a keyword principal "${primaryKeyword}".`,
      url ? `URL analisada: ${url}` : 'URL nao informada; geracao feita com base no briefing manual.',
      '',
      'Tags atuais encontradas:',
      currentTags.length > 0 ? currentTags.join('\n') : '- Nenhuma tag atual informada ou encontrada.',
      '',
      'Sugestoes de title:',
      titleLines.join('\n'),
      '',
      'Sugestoes de meta description:',
      descriptionLines.join('\n'),
      '',
      `Recomendacao final: title="${recommendedTitle}" | description="${recommendedDescription}"`,
      '',
      'Bloco HTML sugerido:',
      '```html',
      metaBlock,
      '```',
    ].join('\n');
  },

  meta_ads_read: async (args, ctx) => {
    const accessToken = normalizeText(ctx.credentials.meta_access_token);
    const accountId = normalizeMetaAdAccountId(
      pickFirstString(args.account_id, ctx.credentials.meta_ad_account_id)
    );

    if (!accessToken) {
      return 'Meta Access Token nao configurado. Salve meta_access_token em /settings.';
    }

    const action = normalizeText(args.action);
    if (!action) {
      return 'action e obrigatorio para consultar Meta Ads.';
    }

    try {
      const limit = pickFirstNumber(args.limit);
      const fields = Array.isArray(args.fields)
        ? args.fields.map((field: unknown) => normalizeText(field)).filter(Boolean).join(',')
        : normalizeText(args.fields);

      if (action === 'get_account') {
        if (!accountId) return 'meta_ad_account_id nao configurado.';

        const data = await runMetaGraphRequest({
          path: accountId,
          accessToken,
          query: {
            fields: fields || 'name,account_status,currency,timezone_name,amount_spent,balance',
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'list_campaigns') {
        if (!accountId) return 'meta_ad_account_id nao configurado.';

        const data = await runMetaGraphRequest({
          path: `${accountId}/campaigns`,
          accessToken,
          query: {
            fields: fields || 'id,name,status,objective,effective_status,daily_budget,lifetime_budget',
            limit: limit || 25,
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'get_campaign') {
        const campaignId = normalizeText(args.campaign_id);
        if (!campaignId) return 'campaign_id e obrigatorio para get_campaign.';

        const data = await runMetaGraphRequest({
          path: campaignId,
          accessToken,
          query: {
            fields: fields || 'id,name,status,objective,effective_status,daily_budget,lifetime_budget',
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'list_adsets') {
        const campaignId = normalizeText(args.campaign_id);
        if (!campaignId && !accountId) return 'meta_ad_account_id ou campaign_id e obrigatorio para list_adsets.';

        const data = await runMetaGraphRequest({
          path: campaignId ? `${campaignId}/adsets` : `${accountId}/adsets`,
          accessToken,
          query: {
            fields: fields || 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event',
            limit: limit || 25,
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'get_adset') {
        const adsetId = normalizeText(args.adset_id);
        if (!adsetId) return 'adset_id e obrigatorio para get_adset.';

        const data = await runMetaGraphRequest({
          path: adsetId,
          accessToken,
          query: {
            fields: fields || 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting',
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'list_ads') {
        const adsetId = normalizeText(args.adset_id);
        if (!adsetId && !accountId) return 'meta_ad_account_id ou adset_id e obrigatorio para list_ads.';

        const data = await runMetaGraphRequest({
          path: adsetId ? `${adsetId}/ads` : `${accountId}/ads`,
          accessToken,
          query: {
            fields: fields || 'id,name,status,effective_status,creative{id,name}',
            limit: limit || 25,
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'get_ad') {
        const adId = normalizeText(args.ad_id);
        if (!adId) return 'ad_id e obrigatorio para get_ad.';

        const data = await runMetaGraphRequest({
          path: adId,
          accessToken,
          query: {
            fields: fields || 'id,name,status,effective_status,creative{id,name,object_story_spec}',
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'get_insights') {
        const level = normalizeText(args.level || 'account') || 'account';
        const campaignId = normalizeText(args.campaign_id);
        const adsetId = normalizeText(args.adset_id);
        const adId = normalizeText(args.ad_id);
        const path = level === 'campaign'
          ? campaignId
          : level === 'adset'
            ? adsetId
            : level === 'ad'
              ? adId
              : accountId;

        if (!path) {
          return 'Informe meta_ad_account_id ou o ID especifico do nivel solicitado para consultar insights.';
        }

        const query: Record<string, unknown> = {
          fields: fields || 'campaign_name,adset_name,ad_name,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency',
          limit: limit || 50,
        };

        const datePreset = normalizeText(args.date_preset);
        const since = normalizeText(args.since);
        const until = normalizeText(args.until);
        if (since && until) {
          query.time_range = JSON.stringify({ since, until });
        } else if (datePreset) {
          query.date_preset = datePreset;
        }

        const data = await runMetaGraphRequest({
          path: `${path}/insights`,
          accessToken,
          query,
        });

        return stringifyServiceResponse(data);
      }

      return `Acao "${action}" nao suportada em meta_ads_read.`;
    } catch (error: any) {
      logger.error('meta_ads_read', 'Falha ao consultar Meta Ads', error.message);
      return `Erro ao consultar Meta Ads: ${error.message}`;
    }
  },

  meta_ads_manage: async (args, ctx) => {
    const accessToken = normalizeText(ctx.credentials.meta_access_token);
    const accountId = normalizeMetaAdAccountId(
      pickFirstString(args.account_id, ctx.credentials.meta_ad_account_id)
    );

    if (!accessToken) {
      return 'Meta Access Token nao configurado. Salve meta_access_token em /settings.';
    }

    if (args.confirm !== true) {
      return 'Essa acao altera a conta de anuncios real. Confirme explicitamente com o usuario e chame novamente com confirm=true.';
    }

    const action = normalizeText(args.action);
    if (!action) {
      return 'action e obrigatorio para gerenciar Meta Ads.';
    }

    try {
      if (action === 'create_campaign') {
        if (!accountId) return 'meta_ad_account_id nao configurado.';

        const name = normalizeText(args.name);
        const objective = normalizeText(args.objective);
        if (!name || !objective) return 'name e objective sao obrigatorios para create_campaign.';

        const data = await runMetaGraphRequest({
          path: `${accountId}/campaigns`,
          accessToken,
          method: 'POST',
          body: {
            name,
            objective,
            status: normalizeText(args.status || 'PAUSED') || 'PAUSED',
            special_ad_categories: Array.isArray(args.special_ad_categories) ? args.special_ad_categories : [],
          },
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'update_campaign' || action === 'set_campaign_status') {
        const campaignId = normalizeText(args.campaign_id);
        if (!campaignId) return 'campaign_id e obrigatorio.';

        const payload: Record<string, unknown> = {};
        if (action === 'set_campaign_status') {
          const status = normalizeText(args.status);
          if (!status) return 'status e obrigatorio para set_campaign_status.';
          payload.status = status;
        } else {
          if (args.name !== undefined) payload.name = normalizeText(args.name);
          if (args.objective !== undefined) payload.objective = normalizeText(args.objective);
          if (args.status !== undefined) payload.status = normalizeText(args.status);
          if (args.special_ad_categories !== undefined) {
            payload.special_ad_categories = Array.isArray(args.special_ad_categories)
              ? args.special_ad_categories
              : [];
          }
        }

        const data = await runMetaGraphRequest({
          path: campaignId,
          accessToken,
          method: 'POST',
          body: payload,
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'create_adset') {
        if (!accountId) return 'meta_ad_account_id nao configurado.';

        const name = normalizeText(args.name);
        const campaignId = normalizeText(args.campaign_id);
        const billingEvent = normalizeText(args.billing_event);
        const optimizationGoal = normalizeText(args.optimization_goal);
        const targeting = args.targeting;

        if (!name || !campaignId || !billingEvent || !optimizationGoal || !targeting) {
          return 'name, campaign_id, billing_event, optimization_goal e targeting sao obrigatorios para create_adset.';
        }

        const body: Record<string, unknown> = {
          name,
          campaign_id: campaignId,
          billing_event: billingEvent,
          optimization_goal: optimizationGoal,
          targeting,
          status: normalizeText(args.status || 'PAUSED') || 'PAUSED',
        };

        if (args.daily_budget !== undefined) body.daily_budget = String(args.daily_budget);
        if (args.lifetime_budget !== undefined) body.lifetime_budget = String(args.lifetime_budget);
        if (args.bid_amount !== undefined) body.bid_amount = String(args.bid_amount);
        if (args.start_time !== undefined) body.start_time = normalizeText(args.start_time);
        if (args.end_time !== undefined) body.end_time = normalizeText(args.end_time);

        const data = await runMetaGraphRequest({
          path: `${accountId}/adsets`,
          accessToken,
          method: 'POST',
          body,
        });

        return stringifyServiceResponse(data);
      }

      if (action === 'update_adset' || action === 'set_adset_status') {
        const adsetId = normalizeText(args.adset_id);
        if (!adsetId) return 'adset_id e obrigatorio.';

        const payload: Record<string, unknown> = {};
        if (action === 'set_adset_status') {
          const status = normalizeText(args.status);
          if (!status) return 'status e obrigatorio para set_adset_status.';
          payload.status = status;
        } else {
          if (args.name !== undefined) payload.name = normalizeText(args.name);
          if (args.status !== undefined) payload.status = normalizeText(args.status);
          if (args.daily_budget !== undefined) payload.daily_budget = String(args.daily_budget);
          if (args.lifetime_budget !== undefined) payload.lifetime_budget = String(args.lifetime_budget);
          if (args.billing_event !== undefined) payload.billing_event = normalizeText(args.billing_event);
          if (args.optimization_goal !== undefined) payload.optimization_goal = normalizeText(args.optimization_goal);
          if (args.bid_amount !== undefined) payload.bid_amount = String(args.bid_amount);
          if (args.targeting !== undefined) payload.targeting = args.targeting;
          if (args.start_time !== undefined) payload.start_time = normalizeText(args.start_time);
          if (args.end_time !== undefined) payload.end_time = normalizeText(args.end_time);
        }

        const data = await runMetaGraphRequest({
          path: adsetId,
          accessToken,
          method: 'POST',
          body: payload,
        });

        return stringifyServiceResponse(data);
      }

      return `Acao "${action}" nao suportada em meta_ads_manage.`;
    } catch (error: any) {
      logger.error('meta_ads_manage', 'Falha ao alterar Meta Ads', error.message);
      return `Erro ao alterar Meta Ads: ${error.message}`;
    }
  },

  send_buttons: async (args) => {
    const { message, options } = args;
    if (!options?.length) return message || '';
    const btns = options.map((o: string) => `[${o}]`).join(' ');
    return `${message}\n\n[[buttons]] ${btns} [[/buttons]]`;
  },

  // ── Call API: chama APIs externas ──
  call_api: async (args, ctx) => {
    const { method, url, headers, body } = args;
    if (!url || !method) return 'URL e método são obrigatórios.';

    const resolvedUrl = String(await resolveCredentialPlaceholders(String(url), ctx.tenantId));
    const resolvedHeaders = await resolveCredentialPlaceholders(headers || {}, ctx.tenantId) as Record<string, string>;
    const resolvedBody = await resolveCredentialPlaceholders(body || null, ctx.tenantId);

    // Segurança: bloqueia localhost/IPs internos
    if (resolvedUrl.match(/localhost|127\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2|3[01])\./)) {
      return 'Bloqueado: não é permitido acessar endereços internos/localhost.';
    }

    try {
      const fetchOptions: any = {
        method,
        headers: { 'Content-Type': 'application/json', ...(resolvedHeaders || {}) },
        signal: AbortSignal.timeout(15000),
      };

      let finalBody = resolvedBody;
      if (typeof finalBody === 'string') {
        try { finalBody = JSON.parse(finalBody); } catch (e) {}
      }

      if (finalBody && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify(finalBody);
      }

      logger.info('call_api', `${method} ${resolvedUrl}`);
      const res = await fetch(resolvedUrl, fetchOptions);
      const contentType = res.headers.get('content-type') || '';

      let responseData: string;
      if (contentType.includes('json')) {
        const json = await res.json();
        responseData = JSON.stringify(json, null, 2).slice(0, 4000);
      } else {
        responseData = (await res.text()).slice(0, 4000);
      }

      return `Status: ${res.status} ${res.statusText}\n\nResposta:\n${responseData}`;
    } catch (e: any) {
      return `Erro na chamada API: ${e.message}`;
    }
  },

  // ── Self-Configure: auto-configuração do agente ──
  self_configure: async (args, ctx) => {
    const { action, soul, skill_id, credential_key, credential_value } = args;

    if (action === 'update_soul') {
      if (!soul?.trim()) return 'Soul não pode ser vazio.';
      await prisma.agent.update({
        where: { id: ctx.agentId },
        data: { systemPrompt: soul.trim() },
      });
      await KnowledgeService.setSoul(ctx.tenantId, ctx.agentId, soul.trim());
      logger.info('self_configure', `Agente ${ctx.agentId} atualizou seu próprio soul (${soul.length} chars)`);
      return `✅ Soul atualizado com sucesso. Suas novas instruções entrarão em vigor na próxima mensagem.`;
    }

    if (action === 'install_skill') {
      if (!skill_id) return 'skill_id é obrigatório para install_skill.';
      const { SKILL_CATALOG } = await import('./catalog.js');
      if (!SKILL_CATALOG[skill_id]) return `Skill "${skill_id}" não encontrada no catálogo.`;
      await SkillRegistry.activate(ctx.tenantId, ctx.agentId, skill_id);
      logger.info('self_configure', `Agente ${ctx.agentId} instalou skill: ${skill_id}`);
      return `✅ Skill "${SKILL_CATALOG[skill_id].name}" instalada e ativa.`;
    }

    if (action === 'save_credential') {
      if (!credential_key || !credential_value) return 'credential_key e credential_value são obrigatórios.';
      const { settingsService } = await import('../settings.service.js');
      await settingsService.set(ctx.tenantId, credential_key, credential_value, true);

      // 1. Verifica se a credencial pertence a uma Skill Nativa
      const { SKILL_CATALOG } = await import('./catalog.js');
      const nativeSkill = Object.values(SKILL_CATALOG).find((s: any) => 
        s.credentials?.some((c: any) => c.key === credential_key)
      );

      if (nativeSkill) {
        await SkillRegistry.activate(ctx.tenantId, ctx.agentId, nativeSkill.id);
        logger.info('self_configure', `Agente ${ctx.agentId} ativou nativa ${nativeSkill.id} via save_credential`);
        return `✅ Credencial nativa "${credential_key}" salva no Cofre. A Skill "${nativeSkill.name}" foi automaticamente ativada com sucesso! Responda o que pode fazer agora com essa integração instalada.`;
      }

      // 2. Se não for nativa, cria uma Integração Customizada genérica (API REST)
      const apiName = credential_key
        .replace(/_api_key$|_key$|_secret$|_token$/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      await prisma.agentSkill.upsert({
        where: { agentId_skillId: { agentId: ctx.agentId, skillId: `custom:${credential_key}` } },
        create: {
          tenantId: ctx.tenantId,
          agentId: ctx.agentId,
          skillId: `custom:${credential_key}`,
          enabled: true,
          config: toDbJson({ credentialKey: credential_key, apiName, installedBy: 'self_configure' }),
        },
        update: {
          enabled: true,
          config: toDbJson({ credentialKey: credential_key, apiName, installedBy: 'self_configure' }),
        },
      });

      logger.info('self_configure', `Agente ${ctx.agentId} salvou credencial e ativou custom api: ${credential_key}`);
      return `✅ Credencial "${credential_key}" salva com segurança no vault do workspace como API Customizada.`;
    }

    return `Ação "${action}" não reconhecida. Use: update_soul, install_skill ou save_credential.`;
  },

  // ── Self-Improving: aprende com erros ──
  learn_from_interaction: async (args, ctx) => {
    const { type, title, details } = args;
    await KnowledgeService.save(ctx.tenantId, ctx.agentId, {
      title: `[${(type || 'learning').toUpperCase()}] ${title}`,
      content: `**Tipo:** ${type}\n\n${details}\n\n_Aprendido automaticamente em ${new Date().toLocaleDateString('pt-BR')}_`,
    });
    return `Aprendizado registrado: "${title}". Será considerado em futuras conversas.`;
  },

  // ── Busca Web: DuckDuckGo + Google (grátis, com fallback) ──
  duckduckgo_search: async (args) => {
    const query = args.query;
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    let results: string[] = [];

    // 1. Google Search (scraping — melhor qualidade)
    try {
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&num=5`;
      const res = await fetch(googleUrl, {
        headers: { 'User-Agent': ua, 'Accept-Language': 'pt-BR,pt;q=0.9' },
        signal: AbortSignal.timeout(8000),
      });
      const html = await res.text();

      // Parse Google results
      const blocks = html.split('<div class="g"').slice(1, 6);
      for (const block of blocks) {
        const titleMatch = block.match(/<h3[^>]*>(.*?)<\/h3>/s);
        const snippetMatch = block.match(/class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/span>/);
        const linkMatch = block.match(/href="(https?:\/\/[^"&]+)"/);

        const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim();
        const url = linkMatch?.[1];

        if (title && (snippet || url)) {
          results.push(`${title}: ${snippet || ''} ${url ? `(${url})` : ''}`);
        }
      }

      if (results.length > 0) {
        logger.info('Search', `Google retornou ${results.length} resultados para "${query}"`);
        return JSON.stringify(results);
      }
    } catch (e) {
      logger.warn('Search', 'Google falhou, tentando DuckDuckGo...');
    }

    // 2. DuckDuckGo HTML (fallback)
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(ddgUrl, {
        headers: { 'User-Agent': ua },
        signal: AbortSignal.timeout(8000),
      });
      const html = await res.text();

      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
        const url = decodeURIComponent(match[1].replace(/.*uddg=/, '').split('&')[0]);
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        const snippet = match[3].replace(/<[^>]+>/g, '').trim();
        if (title && snippet) results.push(`${title}: ${snippet} (${url})`);
      }

      if (results.length > 0) {
        logger.info('Search', `DuckDuckGo retornou ${results.length} resultados`);
        return JSON.stringify(results);
      }
    } catch (e) {
      logger.warn('Search', 'DuckDuckGo HTML falhou...');
    }

    // 3. DuckDuckGo API (último recurso)
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data.AbstractText) results.push(`${data.Heading}: ${data.AbstractText}`);
      for (const topic of (data.RelatedTopics || []).slice(0, 5)) {
        if (topic.Text) results.push(topic.Text.slice(0, 200));
      }
    } catch {}

    return results.length > 0
      ? JSON.stringify(results)
      : 'Nenhum resultado encontrado na web.';
  },

  // ── Google Calendar ──
  google_calendar: async (args, ctx) => {
    const apiKey = ctx.credentials.google_api_key;
    if (!apiKey) return 'Google API Key não configurada. Ative nas credenciais da skill.';

    const calendarId = ctx.credentials.google_calendar_id || 'primary';
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

    if (args.action === 'list') {
      const days = args.days_ahead || 7;
      const now = new Date().toISOString();
      const future = new Date(Date.now() + days * 86400000).toISOString();
      const res = await fetch(`${base}/events?key=${apiKey}&timeMin=${now}&timeMax=${future}&singleEvents=true&orderBy=startTime`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (!data.items?.length) return 'Nenhum evento encontrado.';
      return JSON.stringify(data.items.map((e: any) => ({
        id: e.id, title: e.summary, start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date,
      })));
    }

    return `Ação "${args.action}" do Google Calendar ainda não implementada server-side. Use a API diretamente.`;
  },

  // ── Trello ──
  trello: async (args, ctx) => {
    const apiKey = ctx.credentials.trello_api_key;
    const token = ctx.credentials.trello_token;
    if (!apiKey || !token) return 'Credenciais do Trello não configuradas.';

    const base = 'https://api.trello.com/1';
    const auth = `key=${apiKey}&token=${token}`;

    if (args.action === 'list_boards') {
      const res = await fetch(`${base}/members/me/boards?${auth}&fields=name,id`, { signal: AbortSignal.timeout(10000) });
      return JSON.stringify(await res.json());
    }
    if (args.action === 'list_cards' && args.list_id) {
      const res = await fetch(`${base}/lists/${args.list_id}/cards?${auth}&fields=name,id,desc`, { signal: AbortSignal.timeout(10000) });
      return JSON.stringify(await res.json());
    }
    if (args.action === 'create_card' && args.list_id && args.title) {
      const res = await fetch(`${base}/cards?${auth}&idList=${args.list_id}&name=${encodeURIComponent(args.title)}&desc=${encodeURIComponent(args.description || '')}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
      const card = await res.json();
      return `Cartão "${card.name}" criado com sucesso (ID: ${card.id}).`;
    }

    return `Ação "${args.action}" do Trello não implementada.`;
  },

  // ── Email Send — Brevo REST API (principal) + SMTP nativo (fallback) ──
  email_send: async (args, ctx) => {
    const { to, subject, body } = args;
    if (!to || !subject || !body) return 'Campos obrigatórios: to, subject, body.';

    const brevoKey = ctx.credentials.smtp_pass || ctx.credentials.brevo_key;
    const smtpHost = ctx.credentials.smtp_host;
    const smtpUser = ctx.credentials.smtp_user;

    if (!brevoKey && !smtpHost) return 'Credenciais SMTP/Brevo não configuradas. Adicione smtp_host, smtp_user e smtp_pass nas credenciais da skill.';

    // Tentativa 1: Brevo REST API (mais simples, sem SMTP)
    if (brevoKey && brevoKey.startsWith('xkeysib')) {
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { email: smtpUser || 'noreply@lumiplus.ai' },
            to: [{ email: to }],
            subject,
            htmlContent: `<p>${body.replace(/\n/g, '<br>')}</p>`,
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          logger.success('email_send', `Email enviado via Brevo para ${to}`);
          return `Email enviado para ${to} com sucesso.`;
        }
        const errData = await res.json().catch(() => ({}));
        logger.warn('email_send', `Brevo falhou (${res.status}), tentando SMTP...`, errData);
      } catch (e: any) {
        logger.warn('email_send', `Brevo com erro: ${e.message}, tentando SMTP...`);
      }
    }

    // Tentativa 2: SMTP nativo via nodemailer
    if (smtpHost && smtpUser && brevoKey) {
      try {
        const { createTransport } = await import('nodemailer');
        const port = smtpHost.includes('gmail') ? 587 : (smtpHost.includes('brevo') ? 587 : 465);
        const transporter = createTransport({
          host: smtpHost,
          port,
          secure: port === 465,
          auth: { user: smtpUser, pass: brevoKey },
        });
        await transporter.sendMail({
          from: smtpUser,
          to,
          subject,
          text: body,
          html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
        });
        logger.success('email_send', `Email enviado via SMTP para ${to}`);
        return `Email enviado para ${to} com sucesso.`;
      } catch (e: any) {
        logger.error('email_send', `SMTP falhou: ${e.message}`);
        return `Erro ao enviar email via SMTP: ${e.message}`;
      }
    }

    return 'Credenciais insuficientes. Configure smtp_host + smtp_user + smtp_pass.';
  },

  // ── Brevo Marketing ──
  brevo_marketing: async (args, ctx) => {
    let key: string | null | undefined = ctx.credentials.brevo_api_key;
    if (!key) {
      const { settingsService } = await import('../settings.service.js');
      key = await settingsService.get(ctx.tenantId, 'smtp_pass');
    }
    if (!key) return 'Brevo API Key não configurada.';

    const headers = { 'api-key': String(key), 'Content-Type': 'application/json' };
    const baseUrl = 'https://api.brevo.com/v3';

    try {
      if (args.action === 'list_lists') {
        const res = await fetch(`${baseUrl}/contacts/lists?limit=50`, { headers, signal: AbortSignal.timeout(10000) });
        return JSON.stringify(await res.json());
      }
      if (args.action === 'list_contacts') {
        const res = await fetch(`${baseUrl}/contacts?limit=50`, { headers, signal: AbortSignal.timeout(10000) });
        return JSON.stringify(await res.json());
      }
      if (args.action === 'add_contact') {
        if (!args.email) return 'Email é obrigatório para add_contact.';
        const payload = {
          email: args.email,
          updateEnabled: true,
          ...(args.listIds && { listIds: args.listIds }),
          ...(args.attributes && { attributes: args.attributes })
        };
        const res = await fetch(`${baseUrl}/contacts`, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
        if ([200, 201, 204].includes(res.status)) return `Contato ${args.email} adicionado/atualizado.`;
        return `Erro ao adicionar: ${await res.text()}`;
      }
      if (args.action === 'update_contact') {
        if (!args.email) return 'Email é obrigatório para update_contact.';
        const payload = { ...(args.listIds && { listIds: args.listIds }), ...(args.attributes && { attributes: args.attributes }) };
        const res = await fetch(`${baseUrl}/contacts/${encodeURIComponent(args.email)}`, { method: 'PUT', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
        if ([200, 201, 204].includes(res.status)) return `Contato ${args.email} atualizado.`;
        return `Erro ao atualizar: ${await res.text()}`;
      }
      return `Ação "${args.action}" não reconhecida.`;
    } catch (e: any) {
      return `Erro na integração Brevo: ${e.message}`;
    }
  },

  // ── Stripe ──
  stripe_query: async (args, ctx) => {
    const key = ctx.credentials.stripe_secret_key;
    if (!key) return 'Stripe Secret Key não configurada.';

    const headers = { 'Authorization': `Bearer ${key}` };

    if (args.action === 'list_customers') {
      const res = await fetch(`https://api.stripe.com/v1/customers?limit=${args.limit || 10}`, { headers, signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      return JSON.stringify(data.data?.map((c: any) => ({ id: c.id, name: c.name, email: c.email })) || []);
    }
    if (args.action === 'get_balance') {
      const res = await fetch('https://api.stripe.com/v1/balance', { headers, signal: AbortSignal.timeout(10000) });
      return JSON.stringify(await res.json());
    }

    return `Ação "${args.action}" do Stripe não implementada.`;
  },

  // ── Manage Cron: cria/edita/lista/deleta cronjobs via conversa ──
  manage_cron: async (args, ctx) => {
    const { action, id, name, prompt, schedule, timezone, enabled } = args;
    const tz = timezone || 'America/Sao_Paulo';

    if (action === 'list') {
      const jobs = await prisma.agentCronJob.findMany({
        where: { tenantId: ctx.tenantId, agentId: ctx.agentId },
        orderBy: { createdAt: 'desc' },
      });
      if (!jobs.length) return 'Nenhum agendamento criado ainda. Use manage_cron(action="create") para criar um.';
      const lines = jobs.map(j => {
        const status = j.enabled ? '✅' : '⏸️';
        const lastRun = j.lastRunAt ? `última execução: ${new Date(j.lastRunAt).toLocaleString('pt-BR')}` : 'nunca executado';
        return `${status} **${j.name}** (ID: ${j.id.slice(0, 8)})\n   Schedule: \`${j.schedule}\` (${j.timezone})\n   Prompt: "${j.prompt.slice(0, 80)}..."\n   ${lastRun}`;
      });
      return `**Agendamentos ativos (${jobs.length}):**\n\n${lines.join('\n\n')}`;
    }

    if (action === 'create') {
      if (!name || !prompt || !schedule) return 'Para criar um cron são obrigatórios: name, prompt e schedule.';

      // Valida a expressão cron
      const cronLib = await import('node-cron');
      if (!cronLib.default.validate(schedule)) {
        return `Expressão cron inválida: "${schedule}". Exemplos válidos:\n- "0 9 * * *" = todo dia às 9h\n- "0 9 * * 1" = toda segunda às 9h\n- "*/30 * * * *" = a cada 30 min\n- "0 18 * * 1-5" = dias úteis às 18h`;
      }

      const job = await prisma.agentCronJob.create({
        data: {
          tenantId: ctx.tenantId,
          agentId: ctx.agentId,
          name,
          prompt,
          schedule,
          timezone: tz,
          enabled: enabled !== false,
        },
      });

      // Dispara reload imediato no CronService
      const { CronService } = await import('../cron.service.js');
      await CronService.reload();

      logger.success('manage_cron', `Cron "${name}" criado para agente ${ctx.agentId}: ${schedule}`);
      return `✅ Agendamento **"${name}"** criado!\n\n- Schedule: \`${schedule}\` (${tz})\n- Tarefa: "${prompt.slice(0, 100)}"\n- ID: ${job.id.slice(0, 8)}\n\nO agente executará essa tarefa automaticamente no horário configurado.`;
    }

    if (action === 'update') {
      if (!id) return 'ID do cronjob é obrigatório para atualizar.';

      // Busca pelo ID parcial (primeiros 8 chars) ou completo
      const existing = await prisma.agentCronJob.findFirst({
        where: {
          tenantId: ctx.tenantId,
          agentId: ctx.agentId,
          OR: [{ id }, { id: { startsWith: id } }],
        },
      });
      if (!existing) return `Agendamento "${id}" não encontrado. Use manage_cron(action="list") para ver os IDs.`;

      // Valida novo schedule se fornecido
      if (schedule) {
        const cronLib = await import('node-cron');
        if (!cronLib.default.validate(schedule)) {
          return `Expressão cron inválida: "${schedule}".`;
        }
      }

      const updated = await prisma.agentCronJob.update({
        where: { id: existing.id },
        data: {
          ...(name && { name }),
          ...(prompt && { prompt }),
          ...(schedule && { schedule }),
          ...(timezone && { timezone }),
          ...(enabled !== undefined && { enabled }),
        },
      });

      const { CronService } = await import('../cron.service.js');
      await CronService.reload();

      logger.info('manage_cron', `Cron "${updated.name}" atualizado para agente ${ctx.agentId}`);
      return `✅ Agendamento **"${updated.name}"** atualizado!\n\n- Schedule: \`${updated.schedule}\` (${updated.timezone})\n- Status: ${updated.enabled ? 'ativo' : 'pausado'}`;
    }

    if (action === 'delete') {
      if (!id) return 'ID do cronjob é obrigatório para deletar.';

      const existing = await prisma.agentCronJob.findFirst({
        where: {
          tenantId: ctx.tenantId,
          agentId: ctx.agentId,
          OR: [{ id }, { id: { startsWith: id } }],
        },
      });
      if (!existing) return `Agendamento "${id}" não encontrado. Use manage_cron(action="list") para ver os IDs.`;

      await prisma.agentCronJob.delete({ where: { id: existing.id } });

      const { CronService } = await import('../cron.service.js');
      await CronService.reload();

      logger.info('manage_cron', `Cron "${existing.name}" removido do agente ${ctx.agentId}`);
      return `✅ Agendamento **"${existing.name}"** removido com sucesso.`;
    }

    if (action === 'run') {
      if (!id) return 'ID do cronjob é obrigatório para executar.';

      const existing = await prisma.agentCronJob.findFirst({
        where: {
          tenantId: ctx.tenantId,
          agentId: ctx.agentId,
          OR: [{ id }, { id: { startsWith: id } }],
        },
      });
      if (!existing) return `Agendamento "${id}" não encontrado.`;

      const { CronService } = await import('../cron.service.js');
      await CronService.executeJob(existing.id);

      logger.info('manage_cron', `Cron "${existing.name}" executado manualmente pelo agente ${ctx.agentId}`);
      return `✅ Agendamento **"${existing.name}"** executado manualmente agora.`;
    }

    return `Ação "${action}" não reconhecida. Use: list, create, update, delete ou run.`;
  },

  // ── ClawhHub Import: importa skills/agentes do marketplace ──
  clawhub_import: async (args, ctx) => {
    let { url, apply_to_soul } = args;
    if (!url) return 'URL do ClawhHub é obrigatória.';

    // Normaliza URL: aceita nome curto ou URL completa
    if (!url.startsWith('http')) {
      url = `https://clawhub.ai/${url.replace(/^\//, '')}`;
    }

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // 1. Tenta buscar o SKILL.md direto (GitHub raw ou similar)
    let skillContent = '';

    // Extrai autor/slug da URL para montar link do SKILL.md
    const match = url.match(/clawhub\.ai\/([^/]+)\/([^/?#]+)/);
    if (!match) return `URL inválida. Use o formato: https://clawhub.ai/autor/skill-name`;

    const [, author, slug] = match;

    // Tenta buscar via GitHub (ClawhHub usa repositórios GitHub)
    const rawUrls = [
      `https://raw.githubusercontent.com/${author}/${slug}/main/SKILL.md`,
      `https://raw.githubusercontent.com/${author}/${slug}/master/SKILL.md`,
      `https://raw.githubusercontent.com/${author}/${slug}/main/.clawhub/SKILL.md`,
    ];

    for (const rawUrl of rawUrls) {
      try {
        const res = await fetch(rawUrl, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          skillContent = await res.text();
          logger.info('clawhub_import', `SKILL.md obtido via GitHub: ${rawUrl}`);
          break;
        }
      } catch {}
    }

    // Fallback: scraping da página do ClawhHub
    if (!skillContent) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(10000) });
        const html = await res.text();

        // Extrai conteúdo de markdown visível na página
        const mdMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
          || html.match(/class="[^"]*markdown[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

        if (mdMatch) {
          skillContent = mdMatch[1].replace(/<[^>]+>/g, '').trim();
        } else {
          // Extrai texto relevante (título + descrição)
          const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
          const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)
            || html.match(/<meta[^>]*content="([^"]+)"[^>]*name="description"/i);
          skillContent = [
            titleMatch ? `# ${titleMatch[1].replace(/<[^>]+>/g, '').trim()}` : `# ${slug}`,
            descMatch ? `\n${descMatch[1]}` : '',
            `\nFonte: ${url}`,
          ].join('\n');
        }
        logger.info('clawhub_import', `Conteúdo obtido via scraping de ${url}`);
      } catch (e: any) {
        return `Erro ao acessar ClawhHub: ${e.message}`;
      }
    }

    if (!skillContent || skillContent.length < 20) {
      return `Não foi possível obter o conteúdo da skill "${slug}". Verifique a URL e tente novamente.`;
    }

    // Trunca para 8000 chars (evita prompts gigantes)
    const contentToSave = skillContent.slice(0, 8000);

    // 2. Salva no Knowledge Hub do agente
    const title = `[ClawhHub] ${author}/${slug}`;
    await KnowledgeService.save(ctx.tenantId, ctx.agentId, {
      title,
      content: `Importado de: ${url}\nAutor: ${author}\n\n${contentToSave}`,
    });

    // 3. Registra como custom skill do agente
    const apiName = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    await prisma.agentSkill.upsert({
      where: { agentId_skillId: { agentId: ctx.agentId, skillId: `custom:clawhub_${slug}` } },
      create: {
        tenantId: ctx.tenantId,
        agentId: ctx.agentId,
        skillId: `custom:clawhub_${slug}`,
        enabled: true,
        config: toDbJson({ credentialKey: `clawhub_${slug}`, apiName: `ClawhHub: ${apiName}`, installedBy: 'clawhub_import', sourceUrl: url }),
      },
      update: {
        enabled: true,
        config: toDbJson({ credentialKey: `clawhub_${slug}`, apiName: `ClawhHub: ${apiName}`, installedBy: 'clawhub_import', sourceUrl: url }),
      },
    });

    logger.success('clawhub_import', `Skill "${slug}" importada do ClawhHub para agente ${ctx.agentId}`);

    // 4. Aplica ao soul se solicitado
    if (apply_to_soul) {
      // Extrai apenas o bloco de system prompt do SKILL.md
      const soulSection = skillContent.match(/##\s*System Prompt[^\n]*\n([\s\S]*?)(?=\n##|$)/i)?.[1]?.trim()
        || skillContent.match(/```[^\n]*\n([\s\S]*?)```/)?.[1]?.trim()
        || skillContent.slice(0, 2000);

      const currentAgent = await prisma.agent.findUnique({ where: { id: ctx.agentId }, select: { systemPrompt: true } });
      const newSoul = `${currentAgent?.systemPrompt || ''}\n\n## Skill: ${apiName} (ClawhHub)\n${soulSection}`.trim();

      await prisma.agent.update({ where: { id: ctx.agentId }, data: { systemPrompt: newSoul } });
      await KnowledgeService.setSoul(ctx.tenantId, ctx.agentId, newSoul);

      return `✅ Skill **${author}/${slug}** importada e incorporada ao seu soul!\n\n- Knowledge Hub: fragment "${title}" salvo\n- Soul: instruções da skill adicionadas\n- Aba Personalizadas: visível no Marketplace\n\nFonte: ${url}`;
    }

    return `✅ Skill **${author}/${slug}** importada com sucesso!\n\n- Knowledge Hub: fragment "${title}" salvo (${contentToSave.length} chars)\n- Aba Personalizadas: visível no Marketplace\n\nDiga "aplique essa skill ao meu soul" para incorporar as instruções ao seu comportamento permanente.\nFonte: ${url}`;
  },

  // ── Notion ──
  notion: async (args, ctx) => {
    const key = ctx.credentials.notion_api_key;
    if (!key) return 'Notion API Key não configurada.';

    const headers = { 'Authorization': `Bearer ${key}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

    if (args.action === 'search') {
      const res = await fetch('https://api.notion.com/v1/search', {
        method: 'POST', headers,
        body: JSON.stringify({ query: args.query || '', page_size: 5 }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      return JSON.stringify(data.results?.map((r: any) => ({
        id: r.id, type: r.object, title: r.properties?.title?.title?.[0]?.plain_text || r.properties?.Name?.title?.[0]?.plain_text || 'Sem título',
      })) || []);
    }

    return `Ação "${args.action}" do Notion não implementada.`;
  },

  // ── Proatividade: Heartbeat (auto-melhoria) ──

  activate_heartbeat: async (args, ctx) => {
    const { frequency = 'daily', focus = 'geral' } = args;

    const schedule = frequency === 'weekly' ? '0 8 * * 1' : '0 8 * * *';
    const label = frequency === 'weekly' ? 'toda segunda-feira às 08:00' : 'todo dia às 08:00';

    const prompt = `[HEARTBEAT — AUTO-MELHORIA]
Você está fazendo sua revisão proativa de qualidade. Execute os seguintes passos:

1. REVISÃO: Use knowledge_search("heartbeat revisão") para ver suas anotações anteriores.
2. PADRÕES: Analise as últimas interações — há perguntas repetidas que indicam uma lacuna sua?
3. MELHORIA: Identifique 1 coisa concreta que você pode fazer melhor no foco: "${focus}".
4. REGISTRO: Use memory_save para anotar o que aprendeu nesta revisão (chave: "heartbeat_insight").
5. PROATIVO: Se identificou algo importante, prepare uma mensagem para o usuário na próxima conversa.

Seja direto e prático. Este é seu momento de evoluir.`;

    // Verifica se já existe um heartbeat
    const existing = await prisma.agentCronJob.findFirst({
      where: { tenantId: ctx.tenantId, agentId: ctx.agentId, name: { contains: 'Heartbeat' } },
    });

    if (existing) {
      await prisma.agentCronJob.update({
        where: { id: existing.id },
        data: { schedule, prompt, enabled: true },
      });

      const { CronService } = await import('../cron.service.js');
      await CronService.reload();

      return `✅ Heartbeat **atualizado** para ${label}!\n\nFoco: "${focus}"\nAnterior: "${existing.name}" (${existing.schedule}) → agora ${schedule}\n\nEu serei notificado automaticamente no próximo ciclo para revisar meu desempenho e melhorar meu atendimento.`;
    }

    await prisma.agentCronJob.create({
      data: {
        tenantId: ctx.tenantId,
        agentId: ctx.agentId,
        name: `💓 Heartbeat — Auto-melhoria (${focus})`,
        prompt,
        schedule,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      },
    });

    const { CronService } = await import('../cron.service.js');
    await CronService.reload();

    return `✅ **Modo Proativo ativado!** Heartbeat configurado para ${label}.\n\nFoco: "${focus}"\nO que vai acontecer:\n- Às 08:00 (${frequency === 'weekly' ? 'toda segunda' : 'todo dia'}), eu farei uma auto-revisão silenciosa\n- Vou analisar padrões das nossas conversas e identificar como melhorar\n- Memórias importantes serão salvas para eu evoluir entre conversas\n\nAlém disso, daqui para frente vou sempre sugerir próximos passos ao final de cada resposta relevante. 🦞`;
  },

  // ── Squad & Workflow (Colaboração Autônoma) ──

  run_squad: async (args, ctx) => {
    const { task } = args;
    if (!task || !task.trim()) {
      return 'Descreva a tarefa que a squad deve executar.';
    }


    try {
      const { AgentSquadService } = await import('../agent-squad.service.js');
      const { SquadExecutionService } = await import('../squad-execution.service.js');
      const squad = await AgentSquadService.getAgentSquad(ctx.tenantId, ctx.agentId);

      if (!squad) {
        return 'Você ainda não tem uma squad configurada. Crie um agente e adicione-o à sua squad com `/squad add <nome>` ou pelo painel web em Agentes.';
      }

      const canvasState = fromDbJson<Record<string, any> | null>((squad as any).canvasState, (squad as any).canvasState ?? null);
      const unlinkedCanvasEmployees = Array.isArray(canvasState?.nodes)
        ? (canvasState.nodes as any[])
            .filter((node) =>
              node?.type === 'agent'
              && node?.parentId
              && node?.data?.role !== 'leader'
              && !node?.data?.agentId
            )
            .map((node) => String(node?.data?.label || 'Funcionario sem nome').trim())
        : [];
      const hasCanvasEmployees = Array.isArray(canvasState?.nodes)
        && (canvasState.nodes as any[]).some((node) =>
          node?.type === 'agent'
          && node?.parentId
          && node?.data?.role !== 'leader'
        );

      const members = squad.members.filter((m: any) => m.role !== 'leader');
      if (members.length === 0 && unlinkedCanvasEmployees.length === 0 && !hasCanvasEmployees) {
        if (unlinkedCanvasEmployees.length > 0) {
          const visibleEmployees = unlinkedCanvasEmployees.slice(0, 5).map((label) => `"${label}"`).join(', ');
          return `Sua squad ainda nao tem funcionarios vinculados a agentes reais. No canvas, estes funcionarios ainda estao sem agente base: ${visibleEmployees}. Abra o Neural Architect e selecione um agente existente em cada funcionario para a squad poder executar tarefas no chat.`;
        }
        return 'Sua squad ainda não tem membros além de você mesmo. Adicione especialistas com `/squad add <nome>` ou pelo painel web.';
      }

      // Notifica o usuário enquanto executa (o handler retorna o resultado final)
      const execution = await SquadExecutionService.trigger({
        tenantId: ctx.tenantId,
        squadId: squad.id,
        objective: task.trim(),
        channel: ctx.runtime?.channel || 'web',
        externalId: ctx.runtime?.externalId || null,
        conversationId: ctx.runtime?.conversationId || null,
        sourceAgentId: ctx.runtime?.sourceAgentId || ctx.agentId,
        persistObjectiveMessage: false,
        persistStartMessage: false,
      });
      return {
        __asyncExecution: true,
        content: `Squad "${execution.squad.name}" iniciada com sucesso.\nRun ID: \`${execution.run.id.slice(0, 8)}...\`\n\nVou trazer o resultado por esta mesma conversa assim que a execucao terminar.`,
        metadata: {
          type: 'squad_triggered',
          runId: execution.run.id,
          squadId: execution.squad.id,
        },
      };
    } catch (err: any) {
      console.error('[Skill:run_squad] Erro:', err.message);
      return `Erro ao acionar a squad: ${err.message}`;
    }
  },

  run_workflow: async (args, ctx) => {
    const { workflow_name, input } = args;
    if (!workflow_name || !workflow_name.trim()) {
      return 'Informe o nome do workflow que deseja disparar.';
    }

    try {
      const [agent, candidateWorkflows, allAgentWorkflows] = await Promise.all([
        prisma.agent.findFirst({
          where: { id: ctx.agentId, tenantId: ctx.tenantId },
          select: { name: true },
        }),
        prisma.workflow.findMany({
          where: {
            tenantId: ctx.tenantId,
            name: containsTextFilter(workflow_name.trim()),
            status: 'active',
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
        prisma.workflow.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: 'active',
          },
          select: {
            name: true,
            description: true,
            trigger: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
      ]);

      const workflow = candidateWorkflows.find((item) =>
        workflowMatchesAgent(item, ctx.agentId, agent?.name)
      );

      if (!workflow) {
        const availableNames = allAgentWorkflows
          .filter((item) => workflowMatchesAgent(item, ctx.agentId, agent?.name))
          .map((item) => item.name?.trim())
          .filter((name): name is string => Boolean(name));

        const suggestion = availableNames.length > 0
          ? ` Workflows disponiveis para este agente: ${[...new Set(availableNames)].slice(0, 5).map((name) => `"${name}"`).join(', ')}.`
          : '';

        return `Workflow "${workflow_name}" nao encontrado para este agente ou esta inativo.${suggestion}`;
      }

      const { WorkflowRunnerService } = await import('../workflow-runner.service.js');
      const run = await WorkflowRunnerService.triggerWorkflow(
        ctx.tenantId,
        workflow.id,
        {
          triggeredBy: 'agent_skill',
          agentId: ctx.agentId,
          input: input || '',
          channel: ctx.runtime?.channel,
          externalId: ctx.runtime?.externalId,
          conversationId: ctx.runtime?.conversationId,
          contactId: ctx.runtime?.contactId,
          sourceAgentId: ctx.runtime?.sourceAgentId || ctx.agentId,
        }
      );
      return {
        __asyncExecution: true,
        content: `Workflow "${workflow.name}" disparado com sucesso.\nID da execucao: \`${run.id.slice(0, 8)}...\`\n\nVou trazer o andamento por esta mesma conversa quando houver atualizacao.`,
        metadata: {
          type: 'workflow_triggered',
          runId: run.id,
          workflowId: workflow.id,
        },
      };

    } catch (err: any) {
      console.error('[Skill:run_workflow] Erro:', err.message);
      return `Erro ao disparar o workflow: ${err.message}`;
    }
  },

  // ── EMAIL: IMAP (Leitura) ──
  email_check: async (args, ctx) => {
    const { settingsService } = await import('../settings.service.js');
    const imapHost = await settingsService.get(ctx.tenantId, 'email_imap_host');
    const imapPort = parseInt(await settingsService.get(ctx.tenantId, 'email_imap_port') || '993');
    const user = await settingsService.get(ctx.tenantId, 'email_user');
    const pass = await settingsService.get(ctx.tenantId, 'email_pass');

    if (!imapHost || !user || !pass) {
      return 'Credenciais de e-mail IMAP não configuradas. Acesse Configurações do agente e preencha: email_imap_host, email_user e email_pass.';
    }

    const limit = Math.min(Number(args.limit) || 5, 20);
    const onlyUnread = Boolean(args.only_unread);
    const searchFrom = args.search_from ? String(args.search_from) : null;
    const searchSubject = args.search_subject ? String(args.search_subject) : null;

    try {
      // Conecta via IMAP puro com TLS (sem dependência externa)
      const { createConnection } = await import('net');
      const { connect: tlsConnect } = await import('tls');

      const emails: { from: string; subject: string; date: string; body: string; uid: number }[] = [];

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout IMAP (20s)')), 20000);

        const socket = tlsConnect({ host: imapHost, port: imapPort, rejectUnauthorized: false }, () => {
          let buffer = '';
          let uid = 1;
          let step = 0;

          const send = (cmd: string) => socket.write(cmd + '\r\n');

          socket.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\r\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              // Login
              if (step === 0 && line.includes('* OK')) {
                step = 1;
                send(`A001 LOGIN "${user}" "${pass}"`);
              } else if (step === 1 && line.includes('A001 OK')) {
                step = 2;
                send('A002 SELECT INBOX');
              } else if (step === 2 && line.includes('A002 OK')) {
                step = 3;
                const criteria = onlyUnread ? 'UNSEEN' : 'ALL';
                send(`A003 SEARCH ${criteria}`);
              } else if (step === 3 && line.startsWith('* SEARCH')) {
                step = 4;
                const uids = line.replace('* SEARCH', '').trim().split(' ').filter(Boolean).map(Number);
                const fetchUids = uids.slice(-limit).join(',');
                if (!fetchUids) { send('A004 LOGOUT'); return; }
                send(`A004 FETCH ${fetchUids} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`);
              } else if (step === 4) {
                // Parse rudimentar de FETCH response
                const fromMatch = line.match(/^From:\s*(.+)/i);
                const subjMatch = line.match(/^Subject:\s*(.+)/i);
                const dateMatch = line.match(/^Date:\s*(.+)/i);

                if (fromMatch) { if (!emails[emails.length - 1] || emails[emails.length - 1].body !== '') emails.push({ from: fromMatch[1].trim(), subject: '', date: '', body: '', uid: uid++ }); else emails[emails.length - 1].from = fromMatch[1].trim(); }
                if (subjMatch && emails.length > 0) emails[emails.length - 1].subject = subjMatch[1].trim();
                if (dateMatch && emails.length > 0) emails[emails.length - 1].date = dateMatch[1].trim();
                if (line === '' && emails.length > 0 && emails[emails.length - 1].body === '') { /* next line is body */ }

                if (line.includes('A004 OK')) { send('A005 LOGOUT'); }
              } else if (line.includes('A005 OK') || line.includes('BYE')) {
                clearTimeout(timeout);
                socket.destroy();
                resolve();
              }
            }
          });

          socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err); });
        });

        socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err); });
      });

      // Aplica filtros locais
      let filtered = emails;
      if (searchFrom) filtered = filtered.filter(e => e.from.toLowerCase().includes(searchFrom.toLowerCase()));
      if (searchSubject) filtered = filtered.filter(e => e.subject.toLowerCase().includes(searchSubject.toLowerCase()));

      if (filtered.length === 0) return 'Nenhum e-mail encontrado com os critérios informados.';

      const result = filtered.map((e, i) =>
        `📧 **E-mail ${i + 1}**\n👤 De: ${e.from}\n📋 Assunto: ${e.subject || '(sem assunto)'}\n📅 Data: ${e.date || 'desconhecida'}`
      ).join('\n\n---\n\n');

      return `Encontrei **${filtered.length} e-mail(s)**:\n\n${result}`;
    } catch (err: any) {
      console.error('[Skill:email_check] Erro:', err.message);
      return `Erro ao conectar ao servidor IMAP: ${err.message}. Verifique se o host (${imapHost}:${imapPort}), usuário e senha estão corretos. Para Gmail, use uma "Senha de App" (não a senha normal).`;
    }
  },

  // ── CLIMA: Google Weather API (com fallback Open-Meteo) ──
  evolution_api_v2: async (args, ctx) => {
    const action = String(args.action || '').trim();
    const baseUrl = String(ctx.credentials.evolution_api_url || '').trim();
    const globalKey = String(ctx.credentials.evolution_global_key || '').trim();
    const instanceKey = String(ctx.credentials.evolution_api_key || '').trim();
    const defaultInstance = String(ctx.credentials.evolution_instance || '').trim();
    const instance = String(args.instance || defaultInstance || '').trim();
    const payload = (args.payload && typeof args.payload === 'object') ? { ...(args.payload as Record<string, unknown>) } : {};
    const phoneNumber = normalizeWhatsappNumber(args.phone_number || args.number || (payload as any).number);
    const groupJid = normalizeGroupJid(args.group_jid || (payload as any).groupJid || (payload as any).remoteJid);
    const normalizedPayload: Record<string, unknown> = { ...payload };
    const directNumber = normalizeWhatsappNumber((payload as any).number || args.number || args.to || args.phone_number);
    const directText = pickFirstString((payload as any).text, args.text, args.message, args.content);
    const directDelay = pickFirstNumber((payload as any).delay, args.delay);
    const directMediaUrl = pickFirstString((payload as any).media, (payload as any).url, args.media_url, args.url);
    const directMediaType = pickFirstString((payload as any).mediatype, (payload as any).mediaType, args.media_type);
    const directCaption = pickFirstString((payload as any).caption, args.caption);
    const directInstanceName = pickFirstString((payload as any).instanceName, args.instance_name, args.instance, defaultInstance);
    const directParticipants = Array.isArray(args.participants)
      ? args.participants.map((value: unknown) => normalizeWhatsappNumber(value)).filter(Boolean)
      : Array.isArray((payload as any).participants)
        ? (payload as any).participants.map((value: unknown) => normalizeWhatsappNumber(value)).filter(Boolean)
        : undefined;
    const directSubject = pickFirstString((payload as any).subject, args.subject);
    const directDescription = pickFirstString((payload as any).description, args.description);
    const directInviteCode = pickFirstString(args.invite_code, (payload as any).inviteCode);
    const directParticipantAction = pickFirstString(args.participant_action, (payload as any).action);
    const directGroupSetting = pickFirstString(args.group_setting, (payload as any).action);
    const directGetParticipants = typeof args.get_participants === 'boolean'
      ? args.get_participants
      : typeof (payload as any).getParticipants === 'boolean'
        ? (payload as any).getParticipants
        : undefined;

    if (directNumber && normalizedPayload.number == null) normalizedPayload.number = directNumber;
    if (directText && normalizedPayload.text == null) normalizedPayload.text = directText;
    if (directDelay !== undefined && normalizedPayload.delay == null) normalizedPayload.delay = directDelay;
    if (directMediaUrl && normalizedPayload.media == null && normalizedPayload.url == null) normalizedPayload.media = directMediaUrl;
    if (directMediaType && normalizedPayload.mediatype == null) normalizedPayload.mediatype = directMediaType;
    if (directCaption && normalizedPayload.caption == null) normalizedPayload.caption = directCaption;
    if (groupJid && normalizedPayload.groupJid == null) normalizedPayload.groupJid = groupJid;
    if (groupJid && normalizedPayload.remoteJid == null) normalizedPayload.remoteJid = groupJid;
    if (directParticipants && normalizedPayload.participants == null) normalizedPayload.participants = directParticipants;
    if (directSubject && normalizedPayload.subject == null) normalizedPayload.subject = directSubject;
    if (directDescription && normalizedPayload.description == null) normalizedPayload.description = directDescription;

    if (!baseUrl) return 'Evolution API URL nao configurada.';

    const actionMap: Record<string, { method: 'GET' | 'POST' | 'DELETE'; path: string; apiKey: string; body?: unknown; query?: Record<string, unknown> }> = {
      create_instance: {
        method: 'POST',
        path: '/instance/create',
        apiKey: globalKey,
        body: {
          instanceName: directInstanceName,
          qrcode: (normalizedPayload as any).qrcode ?? true,
          integration: String((normalizedPayload as any).integration || 'WHATSAPP-BAILEYS'),
          ...(normalizedPayload as object),
        },
      },
      connect_instance: {
        method: 'GET',
        path: `/instance/connect/${instance}`,
        apiKey: instanceKey,
        query: phoneNumber ? { number: phoneNumber } : undefined,
      },
      get_connection_state: {
        method: 'GET',
        path: `/instance/connectionState/${instance}`,
        apiKey: instanceKey,
      },
      send_text: {
        method: 'POST',
        path: `/message/sendText/${instance}`,
        apiKey: instanceKey,
        body: normalizedPayload,
      },
      send_media: {
        method: 'POST',
        path: `/message/sendMedia/${instance}`,
        apiKey: instanceKey,
        body: normalizedPayload,
      },
      send_group_text: {
        method: 'POST',
        path: `/message/sendText/${instance}`,
        apiKey: instanceKey,
        body: {
          number: groupJid,
          text: directText,
          ...(directDelay !== undefined ? { delay: directDelay } : {}),
          ...(payload as object),
        },
      },
      send_group_media: {
        method: 'POST',
        path: `/message/sendMedia/${instance}`,
        apiKey: instanceKey,
        body: {
          number: groupJid,
          ...(directMediaUrl ? { media: directMediaUrl } : {}),
          ...(directMediaType ? { mediatype: directMediaType } : {}),
          ...(directCaption ? { caption: directCaption } : {}),
          ...(directDelay !== undefined ? { delay: directDelay } : {}),
          ...(payload as object),
        },
      },
      validate_numbers: {
        method: 'POST',
        path: `/chat/whatsappNumbers/${instance}`,
        apiKey: instanceKey,
        body: normalizedPayload,
      },
      create_group: {
        method: 'POST',
        path: `/group/create/${instance}`,
        apiKey: instanceKey,
        body: {
          ...(directSubject ? { subject: directSubject } : {}),
          ...(directParticipants ? { participants: directParticipants } : {}),
          ...(payload as object),
        },
      },
      list_groups: {
        method: 'GET',
        path: `/group/fetchAllGroups/${instance}`,
        apiKey: instanceKey,
        query: directGetParticipants !== undefined ? { getParticipants: directGetParticipants } : undefined,
      },
      get_group_info: {
        method: 'GET',
        path: `/group/findGroupInfos/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
      },
      get_group_participants: {
        method: 'GET',
        path: `/group/participants/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
      },
      get_group_invite_code: {
        method: 'GET',
        path: `/group/inviteCode/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
      },
      get_group_invite_info: {
        method: 'GET',
        path: `/group/inviteInfo/${instance}`,
        apiKey: instanceKey,
        query: directInviteCode ? { inviteCode: directInviteCode } : undefined,
      },
      send_group_invite: {
        method: 'POST',
        path: `/group/sendInvite/${instance}`,
        apiKey: instanceKey,
        body: {
          ...(groupJid ? { groupJid } : {}),
          ...(directDescription ? { description: directDescription } : {}),
          ...(directParticipants ? { numbers: directParticipants } : {}),
          ...(payload as object),
        },
      },
      update_group_participants: {
        method: 'POST',
        path: `/group/updateParticipant/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
        body: {
          ...(directParticipantAction ? { action: directParticipantAction } : {}),
          ...(directParticipants ? { participants: directParticipants } : {}),
          ...(payload as object),
        },
      },
      update_group_setting: {
        method: 'POST',
        path: `/group/updateSetting/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
        body: {
          ...(directGroupSetting ? { action: directGroupSetting } : {}),
          ...(payload as object),
        },
      },
      update_group_subject: {
        method: 'POST',
        path: `/group/updateGroupSubject/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
        body: {
          ...(directSubject ? { subject: directSubject } : {}),
          ...(payload as object),
        },
      },
      update_group_description: {
        method: 'POST',
        path: `/group/updateGroupDescription/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
        body: {
          ...(directDescription ? { description: directDescription } : {}),
          ...(payload as object),
        },
      },
      leave_group: {
        method: 'DELETE',
        path: `/group/leaveGroup/${instance}`,
        apiKey: instanceKey,
        query: groupJid ? { groupJid } : undefined,
      },
      configure_webhook: {
        method: 'POST',
        path: `/webhook/set/${instance}`,
        apiKey: instanceKey,
        body: normalizedPayload,
      },
      configure_chatwoot: {
        method: 'POST',
        path: `/chatwoot/set/${instance}`,
        apiKey: instanceKey,
        body: normalizedPayload,
      },
      configure_typebot: {
        method: 'POST',
        path: `/typebot/create/${instance}`,
        apiKey: instanceKey,
        body: normalizedPayload,
      },
    };

    const operation = actionMap[action];
    if (!operation) {
      return 'Acao nao suportada para Evolution API v2. Use: create_instance, connect_instance, get_connection_state, send_text, send_media, send_group_text, send_group_media, validate_numbers, create_group, list_groups, get_group_info, get_group_participants, get_group_invite_code, get_group_invite_info, send_group_invite, update_group_participants, update_group_setting, update_group_subject, update_group_description, leave_group, configure_webhook, configure_chatwoot ou configure_typebot.';
    }

    if (['connect_instance', 'get_connection_state', 'send_text', 'send_media', 'send_group_text', 'send_group_media', 'validate_numbers', 'create_group', 'list_groups', 'get_group_info', 'get_group_participants', 'get_group_invite_code', 'get_group_invite_info', 'send_group_invite', 'update_group_participants', 'update_group_setting', 'update_group_subject', 'update_group_description', 'leave_group', 'configure_webhook', 'configure_chatwoot', 'configure_typebot'].includes(action) && !instance) {
      return 'Informe a instancia na skill ou salve evolution_instance nas configuracoes.';
    }

    if (!operation.apiKey) {
      return action === 'create_instance'
        ? 'Evolution Global API Key nao configurada.'
        : 'Evolution Instance API Key nao configurada.';
    }

    if (action === 'create_instance' && !(operation.body as any)?.instanceName) {
      return 'Para create_instance, informe instance_name ou payload.instanceName, ou salve evolution_instance nas configuracoes.';
    }

    if (action === 'send_text') {
      const body = operation.body as any;
      if (!body?.number || !body?.text) {
        return 'Para send_text, informe o numero e o texto da mensagem. Pode usar os campos diretos number/text da skill.';
      }
    }

    if (action === 'send_media') {
      const body = operation.body as any;
      if (!body?.number || !(body?.media || body?.url)) {
        return 'Para send_media, informe o numero e a URL da midia. Pode usar os campos diretos number/media_url da skill.';
      }
    }

    if (['send_group_text', 'send_group_media', 'get_group_info', 'get_group_participants', 'get_group_invite_code', 'send_group_invite', 'update_group_participants', 'update_group_setting', 'update_group_subject', 'update_group_description', 'leave_group'].includes(action) && !groupJid) {
      return 'Para esta acao de grupo, informe group_jid no formato ...@g.us.';
    }

    if (action === 'send_group_text') {
      const body = operation.body as any;
      if (!body?.number || !body?.text) {
        return 'Para send_group_text, informe group_jid e text.';
      }
    }

    if (action === 'send_group_media') {
      const body = operation.body as any;
      if (!body?.number || !(body?.media || body?.url)) {
        return 'Para send_group_media, informe group_jid e media_url.';
      }
    }

    if (action === 'create_group') {
      const body = operation.body as any;
      if (!body?.subject || !Array.isArray(body?.participants) || body.participants.length === 0) {
        return 'Para create_group, informe subject e participants.';
      }
    }

    if (action === 'get_group_invite_info' && !directInviteCode) {
      return 'Para get_group_invite_info, informe invite_code.';
    }

    if (action === 'send_group_invite') {
      const body = operation.body as any;
      if (!body?.groupJid || !Array.isArray(body?.numbers) || body.numbers.length === 0) {
        return 'Para send_group_invite, informe group_jid e participants.';
      }
    }

    if (action === 'update_group_participants') {
      const body = operation.body as any;
      if (!body?.action || !Array.isArray(body?.participants) || body.participants.length === 0) {
        return 'Para update_group_participants, informe participant_action e participants.';
      }
    }

    if (action === 'update_group_setting') {
      const body = operation.body as any;
      if (!body?.action) {
        return 'Para update_group_setting, informe group_setting.';
      }
    }

    if (action === 'update_group_subject') {
      const body = operation.body as any;
      if (!body?.subject) {
        return 'Para update_group_subject, informe subject.';
      }
    }

    if (action === 'update_group_description') {
      const body = operation.body as any;
      if (!body?.description) {
        return 'Para update_group_description, informe description.';
      }
    }

    try {
      return await runHttpIntegration({
        baseUrl,
        path: operation.path,
        method: operation.method,
        apiKey: operation.apiKey,
        body: operation.body,
        query: operation.query,
      });
    } catch (err: any) {
      if (action === 'create_instance') {
        const details = String(err.message || '').toLowerCase();
        if (
          details.includes('already') ||
          details.includes('em uso') ||
          details.includes('already exists') ||
          details.includes('already in use')
        ) {
          const existingName = String((operation.body as any)?.instanceName || instance || defaultInstance || '');
          return `A instancia "${existingName}" ja existe na Evolution API. Reutilize essa instancia com connect_instance, get_connection_state ou send_text; nao tente criar outro nome automaticamente.`;
        }
      }
      return `Erro na Evolution API v2 (${action}): ${err.message}`;
    }
  },

  evogo_api: async (args, ctx) => {
    const action = String(args.action || '').trim();
    const baseUrl = String(ctx.credentials.evogo_api_url || '').trim();
    const globalKey = String(ctx.credentials.evogo_global_key || '').trim();
    const instanceKey = String(ctx.credentials.evogo_api_key || '').trim();
    const defaultInstance = String(ctx.credentials.evogo_instance || '').trim();
    const instance = String(args.instance || defaultInstance || '').trim();
    const payload = (args.payload && typeof args.payload === 'object') ? args.payload : {};
    const query = (args.query && typeof args.query === 'object') ? args.query : undefined;
    const phoneNumber = String(args.phone_number || '').trim();

    if (!baseUrl) return 'evoGo API URL nao configurada.';

    const actionMap: Record<string, { method: 'GET' | 'POST' | 'DELETE'; path: string; apiKey: string; body?: unknown; query?: Record<string, unknown> }> = {
      create_instance: {
        method: 'POST',
        path: '/instance/create',
        apiKey: globalKey,
        body: {
          name: String((payload as any).name || instance || ''),
          token: String((payload as any).token || instanceKey || ''),
          qrcode: (payload as any).qrcode ?? true,
          ...(payload as object),
        },
      },
      connect_instance: {
        method: 'POST',
        path: '/instance/connect',
        apiKey: instanceKey,
        body: { number: phoneNumber, ...(payload as object) },
      },
      get_status: {
        method: 'GET',
        path: '/instance/status',
        apiKey: instanceKey,
      },
      send_text: {
        method: 'POST',
        path: '/send/text',
        apiKey: instanceKey,
        body: payload,
      },
      send_media: {
        method: 'POST',
        path: '/send/media',
        apiKey: instanceKey,
        body: payload,
      },
      send_poll: {
        method: 'POST',
        path: '/send/poll',
        apiKey: instanceKey,
        body: payload,
      },
      create_group: {
        method: 'POST',
        path: '/group/create',
        apiKey: instanceKey,
        body: payload,
      },
      list_groups: {
        method: 'GET',
        path: '/group/list',
        apiKey: instanceKey,
      },
      check_numbers: {
        method: 'POST',
        path: '/user/check',
        apiKey: instanceKey,
        body: payload,
      },
      get_contacts: {
        method: 'GET',
        path: '/user/contacts',
        apiKey: instanceKey,
      },
      set_webhook: {
        method: 'POST',
        path: '/webhook/set',
        apiKey: instanceKey,
        body: payload,
      },
      get_logs: {
        method: 'GET',
        path: `/instance/logs/${instance}`,
        apiKey: globalKey,
        query: query as Record<string, unknown> | undefined,
      },
    };

    const operation = actionMap[action];
    if (!operation) {
      return 'Acao nao suportada para evoGo. Use: create_instance, connect_instance, get_status, send_text, send_media, send_poll, create_group, list_groups, check_numbers, get_contacts, set_webhook ou get_logs.';
    }

    if (action === 'get_logs' && !instance) {
      return 'Informe a instancia na skill ou salve evogo_instance nas configuracoes para consultar logs.';
    }

    if (!operation.apiKey) {
      return action === 'create_instance' || action === 'get_logs'
        ? 'evoGo Global API Key nao configurada.'
        : 'evoGo Instance API Key nao configurada.';
    }

    if (action === 'create_instance') {
      const body = operation.body as any;
      if (!body?.name) return 'Para create_instance, informe payload.name ou salve evogo_instance nas configuracoes.';
      if (!body?.token) return 'Para create_instance, informe payload.token ou salve evogo_api_key nas configuracoes.';
    }

    try {
      return await runHttpIntegration({
        baseUrl,
        path: operation.path,
        method: operation.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        apiKey: operation.apiKey,
        body: operation.body,
        query: operation.query,
      });
    } catch (err: any) {
      return `Erro na evoGo API (${action}): ${err.message}`;
    }
  },

  weather_check: async (args, ctx) => {
    const location = String(args.location || '').trim();
    const units = args.units === 'imperial' ? 'fahrenheit' : 'celsius';
    if (!location) return 'Localização obrigatória. Exemplo: "São Paulo, BR"';

    const googleKey = ctx.credentials.google_api_key;

    try {
      // Tenta primeiro via Google Geocoding + Open-Meteo (gratuito + preciso)
      const geoUrl = googleKey
        ? `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${googleKey}`
        : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;

      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'LumiPlus/1.0' } });
      const geoData = await geoRes.json();

      let lat: number, lon: number, displayName: string;

      if (googleKey && geoData.results?.[0]) {
        lat = geoData.results[0].geometry.location.lat;
        lon = geoData.results[0].geometry.location.lng;
        displayName = geoData.results[0].formatted_address;
      } else if (geoData[0]) {
        lat = parseFloat(geoData[0].lat);
        lon = parseFloat(geoData[0].lon);
        displayName = geoData[0].display_name.split(',').slice(0, 2).join(',').trim();
      } else {
        return `Não foi possível encontrar a localização "${location}". Tente um nome mais específico (ex: "São Paulo, BR").`;
      }

      // Open-Meteo: gratuito, preciso, sem API key
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=${units}&wind_speed_unit=kmh&timezone=auto&forecast_days=3`;
      const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) });
      const w = await weatherRes.json();

      const current = w.current;
      const daily = w.daily;

      const wmoDescriptions: Record<number, string> = {
        0: '☀️ Céu limpo', 1: '🌤️ Principalmente limpo', 2: '⛅ Parcialmente nublado', 3: '☁️ Encoberto',
        45: '🌫️ Neblina', 48: '🌫️ Neblina com gelo', 51: '🌦️ Chuvisco leve', 53: '🌦️ Chuvisco moderado',
        61: '🌧️ Chuva leve', 63: '🌧️ Chuva moderada', 65: '🌧️ Chuva forte',
        71: '🌨️ Neve leve', 73: '🌨️ Neve moderada', 75: '🌨️ Neve forte',
        80: '🌦️ Pancadas leves', 81: '🌦️ Pancadas moderadas', 82: '⛈️ Pancadas fortes',
        95: '⛈️ Tempestade', 99: '⛈️ Tempestade com granizo',
      };

      const cond = wmoDescriptions[current.weather_code] || `Código ${current.weather_code}`;
      const unit = units === 'celsius' ? '°C' : '°F';

      const forecastLines = daily.time.slice(0, 3).map((date: string, i: number) => {
        const dayName = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : new Date(date).toLocaleDateString('pt-BR', { weekday: 'short' });
        const dayDesc = wmoDescriptions[daily.weather_code[i]] || '';
        return `  ${dayName}: ${daily.temperature_2m_min[i].toFixed(0)}${unit} ~ ${daily.temperature_2m_max[i].toFixed(0)}${unit} ${dayDesc}`;
      }).join('\n');

      return `🌍 **Clima em ${displayName}**

🌡️ **Temperatura:** ${current.temperature_2m.toFixed(1)}${unit} (Sensátion: ${current.apparent_temperature.toFixed(1)}${unit})
${cond}
💧 **Umidade:** ${current.relative_humidity_2m}%
💨 **Vento:** ${current.wind_speed_10m.toFixed(1)} km/h

**📅 Previsão (3 dias):**
${forecastLines}`;
    } catch (err: any) {
      console.error('[Skill:weather_check] Erro:', err.message);
      return `Erro ao buscar dados climáticos: ${err.message}`;
    }
  },

  // ── DEEP RESEARCH: Orquestrador de pesquisa profunda ──
  deep_research: async (args, ctx) => {
    const topic = String(args.topic || '').trim();
    const researchType = args.research_type || 'general';
    const depth = args.depth || 'standard';

    if (!topic) return 'Tópico de pesquisa obrigatório.';

    const typeContext: Record<string, string> = {
      competitive: 'Análise competitiva: SWOT, posicionamento, preços e features dos concorrentes.',
      market: 'Pesquisa de mercado: TAM/SAM/SOM, tendências, players e oportunidades.',
      technical: 'Análise técnica: estado da arte, viabilidade, arquiteturas e benchmarks.',
      academic: 'Pesquisa acadêmica: síntese de papers, metodologias e conclusões principais.',
      due_diligence: 'Due diligence: histórico, riscos, conformidade e saúde financeira.',
      general: 'Pesquisa geral: definição, contexto, tendências e implicações.',
    };

    const depthContext: Record<string, string> = {
      quick: '3 pontos principais + uma recomendação. Máximo 200 palavras.',
      standard: 'Relatório completo com todas as seções do formato padrão. 500-800 palavras.',
      deep: 'Análise exaustiva multi-fonte. Explore sub-tópicos, use múltiplos ângulos. 1000+ palavras com citações.',
    };

    return `🔬 **Iniciando Deep Research: "${topic}"**

📋 **Tipo:** ${typeContext[researchType]}
📊 **Profundidade:** ${depthContext[depth]}

**Plano de pesquisa:**
1. Buscar fontes primárias sobre o tema
2. Identificar dados e estatísticas relevantes
3. Analisar múltiplas perspectivas
4. Sintetizar em relatório estruturado

---
**Instruções para o Agente:** Execute agora as buscas com web_search e scrape_url usando o tópico "${topic}" como foco. Após coletar as informações, estruture o relatório no formato: 📋 SUMÁRIO EXECUTIVO → 🔍 METODOLOGIA → 📊 PRINCIPAIS ACHADOS → 🧠 ANÁLISE → ⚠️ RISCOS → ✅ RECOMENDAÇÕES. Nível de profundidade: ${depth}.`;
  },

};
