/**
 * SkillRegistry — gerencia skills ativas por agente.
 * Retorna tools dinâmicas e executa handlers.
 */

import { prisma } from '../../lib/prisma.js';
import { SKILL_CATALOG, DEFAULT_SKILLS } from './catalog.js';
import { KnowledgeService } from '../knowledge.service.js';
import { logger } from '../../lib/logger.js';

interface SkillContext {
  tenantId: string;
  agentId: string;
  credentials: Record<string, string>;
}

export class SkillRegistry {

  /** Retorna tools ativas de um agente (para passar ao AIService) */
  static async getActiveTools(tenantId: string, agentId: string) {
    const activeSkills = await this.getActiveSkillIds(tenantId, agentId);
    return activeSkills
      .map(id => SKILL_CATALOG[id]?.tool)
      .filter(Boolean);
  }

  /** Retorna adições ao system prompt de skills ativas */
  static async getSystemPromptAdditions(tenantId: string, agentId: string) {
    const activeSkills = await this.getActiveSkillIds(tenantId, agentId);
    return activeSkills
      .map(id => SKILL_CATALOG[id]?.systemPromptAddition)
      .filter(Boolean)
      .join('\n\n');
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
            create: { tenantId, agentId, skillId, enabled: true, config: {} },
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
        create: { tenantId, agentId, skillId, enabled: true, config: {} },
        update: { enabled: true },
      }).catch(() => {});
    }
  }

  /** Ativa uma skill para um agente */
  static async activate(tenantId: string, agentId: string, skillId: string, config: any = {}) {
    if (!SKILL_CATALOG[skillId]) throw new Error(`Skill "${skillId}" não existe no catálogo`);
    return prisma.agentSkill.upsert({
      where: { agentId_skillId: { agentId, skillId } },
      create: { tenantId, agentId, skillId, enabled: true, config },
      update: { enabled: true, config },
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
  static async execute(skillId: string, args: any, context: SkillContext): Promise<string> {
    const handler = SKILL_HANDLERS[skillId];
    if (handler) return handler(args, context);

    // Fallback: handler genérico
    return `Skill "${skillId}" não tem handler implementado ainda.`;
  }
}

// ── Handlers de Skills ──

const SKILL_HANDLERS: Record<string, (args: any, ctx: SkillContext) => Promise<string>> = {

  // ── Send Buttons: retorna texto com marcação de botões ──
  send_buttons: async (args) => {
    const { message, options } = args;
    if (!options?.length) return message || '';
    const btns = options.map((o: string) => `[${o}]`).join(' ');
    return `${message}\n\n[[buttons]] ${btns} [[/buttons]]`;
  },

  // ── Call API: chama APIs externas ──
  call_api: async (args) => {
    const { method, url, headers, body } = args;
    if (!url || !method) return 'URL e método são obrigatórios.';

    // Segurança: bloqueia localhost/IPs internos
    if (url.match(/localhost|127\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2|3[01])\./)) {
      return 'Bloqueado: não é permitido acessar endereços internos/localhost.';
    }

    try {
      const fetchOptions: any = {
        method,
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        signal: AbortSignal.timeout(15000),
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify(body);
      }

      logger.info('call_api', `${method} ${url}`);
      const res = await fetch(url, fetchOptions);
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

      // Registra como custom skill do agente (visível na aba Personalizadas)
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
          config: { credentialKey: credential_key, apiName, installedBy: 'self_configure' },
        },
        update: {
          enabled: true,
          config: { credentialKey: credential_key, apiName, installedBy: 'self_configure' },
        },
      });

      logger.info('self_configure', `Agente ${ctx.agentId} salvou credencial: ${credential_key}`);
      return `✅ Credencial "${credential_key}" salva com segurança no vault do workspace.`;
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
        config: { credentialKey: `clawhub_${slug}`, apiName: `ClawhHub: ${apiName}`, installedBy: 'clawhub_import', sourceUrl: url },
      },
      update: {
        enabled: true,
        config: { credentialKey: `clawhub_${slug}`, apiName: `ClawhHub: ${apiName}`, installedBy: 'clawhub_import', sourceUrl: url },
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
};
