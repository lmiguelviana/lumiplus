import { env } from '../config/env.js';
import { KnowledgeService } from './knowledge.service.js';
import { prisma } from '../lib/prisma.js';
import { PROVIDERS, PROVIDER_SETTING_KEYS, type ProviderAdapter, type ChatMessage as ProviderChatMessage } from './providers/index.js';
import { SkillRegistry } from './skills/registry.js';
import { ApiOnboardingService } from './api-onboarding.service.js';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIResponse {
  content: string;
  model: string;
  tokensUsed: number;
  interactionId?: string;
}

/**
 * IA Orchestrator — Multi-Provider com fallback sequencial.
 * Suporta: OpenRouter, OpenAI, Anthropic, Google, DeepSeek, Moonshot, Zhipu.
 */
export class AIService {

  static async complete(
    tenantId: string,
    agentId: string,
    messages: ChatMessage[],
    models?: string[],
    channel?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let contextUsed = '';
    
    // 0. Buscar configurações do agente
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    
    try {
      const onboardingResult = await ApiOnboardingService.maybeHandle(tenantId, agentId, messages);
      if (onboardingResult?.handled) {
        const aiRes = {
          content: onboardingResult.response || 'Configuracao concluida.',
          model: 'system/api-onboarding',
          tokensUsed: 0
        };
        const interactionId = await this.logInteraction(tenantId, agentId, messages, aiRes, 'api_onboarding', Date.now() - startTime).catch(() => undefined);
        return { ...aiRes, interactionId };
      }

      // 1. Injeção de "Soul" (Identidade e Regras)
      const systemContext: ChatMessage[] = [];
      
      const agentName = agent?.name || 'Assistente';
      const channelLabel = channel === 'telegram' ? 'Telegram' : channel === 'whatsapp' ? 'WhatsApp' : channel === 'web' ? 'Chat Web' : '';
      const channelInfo = channelLabel ? `\nVocê está conversando com o usuário via ${channelLabel}. Você TEM acesso a este canal e pode interagir normalmente.` : '';

      const soulPrompt = `Você é ${agentName}. Quando perguntarem seu nome, responda "${agentName}".${channelInfo}

MISSÃO: ${agent?.mission || 'Ajudar o usuário.'}
TOM: ${agent?.tone || 'Profissional'}
PERSONALIDADE: ${agent?.personality || 'Prestativa'}

${agent?.systemPrompt || 'Responda de forma clara e objetiva em português.'}`.trim();

      systemContext.push({ role: 'system', content: soulPrompt });

      // 1b. Injeção de SOUL.md (identidade avançada definida pelo usuário)
      try {
        const soulMd = await KnowledgeService.getSoul(tenantId, agentId);
        if (soulMd) {
          systemContext.push({
            role: 'system',
            content: `## ALMA DO AGENTE (SOUL.md)\n${soulMd}`
          });
        }
      } catch (_) {}

      // 2. Recuperação de Memória de Longo Prazo (Fatos per-contato)
      const contactId = (messages as any).contactId || 'unknown'; 
      if (contactId !== 'unknown') {
        const longTermMemories = await prisma.agentMemory.findMany({
          where: { agentId, contactId }
        });

        if (longTermMemories.length > 0) {
          const memoriesStr = longTermMemories.map((m: any) => `- ${m.key}: ${m.value}`).join('\n');
          systemContext.push({
            role: 'system',
            content: `FATOS CONHECIDOS SOBRE O USUÁRIO:\n${memoriesStr}`
          });
        }
      }

      // 2b. Injeção de instruções das skills ativas
      try {
        const skillAdditions = await SkillRegistry.getSystemPromptAdditions(tenantId, agentId);
        if (skillAdditions) {
          systemContext.push({ role: 'system', content: `## SKILLS ATIVAS\n${skillAdditions}` });
        }
      } catch (_) {}

      let finalMessages = [...systemContext, ...messages];

      // 2c. Estimativa de tokens e truncamento inteligente
      // ~4 chars por token (estimativa conservadora)
      const estimateTokens = (msgs: ChatMessage[]) => msgs.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);
      const MAX_PROMPT_TOKENS = 4000; // Limite seguro para modelos free

      let estimatedTokens = estimateTokens(finalMessages);
      if (estimatedTokens > MAX_PROMPT_TOKENS) {
        console.warn(`[AIService] ⚠️ Prompt muito grande (${estimatedTokens} tokens estimados). Truncando...`);

        // Estratégia: manter system[0] (soul) + últimas N mensagens do usuário
        // Remover: SOUL.md extra, skills verbose, mensagens antigas
        const essentialSystem = systemContext.slice(0, 1); // Só o soul prompt principal
        const userMessages = messages.slice(-6); // Últimas 6 mensagens (3 turnos)

        finalMessages = [...essentialSystem, ...userMessages];
        estimatedTokens = estimateTokens(finalMessages);

        // Se ainda tá grande, truncar o system prompt
        if (estimatedTokens > MAX_PROMPT_TOKENS && finalMessages[0]) {
          const maxSystemChars = (MAX_PROMPT_TOKENS - estimateTokens(userMessages)) * 4;
          if (maxSystemChars > 200) {
            finalMessages[0] = { ...finalMessages[0], content: finalMessages[0].content.slice(0, maxSystemChars) };
          }
        }

        console.log(`[AIService] Prompt truncado: ${estimatedTokens} → ${estimateTokens(finalMessages)} tokens estimados`);
      }

      // 3. Tools dinâmicas do SkillRegistry (por agente)
      const tools = await SkillRegistry.getActiveTools(tenantId, agentId);

      // 4. Montar cadeia de tentativas: [primaryProvider+model, ...fallbackConfig, ...fallbackModels via OpenRouter]
      const { settingsService } = await import('./settings.service.js');

      interface ProviderAttempt { provider: string; model: string; }
      const attempts: ProviderAttempt[] = [];

      // Primary
      // Provider/model: agente > config global > padrão
      // Suporte ao formato "nvidia:model-id" nos selects de UI (encode provider+model numa string)
      const globalProvider = await settingsService.get(tenantId, 'ai_provider');
      const globalModel = await settingsService.get(tenantId, 'ai_default_model');
      let rawPrimaryModel = agent?.primaryModel || globalModel || 'google/gemini-2.0-flash-001';
      let primaryProvider = (agent as any)?.primaryProvider || globalProvider || 'openrouter';

      // Decode "nvidia:model-id" → provider=nvidia, model=model-id
      if (rawPrimaryModel.startsWith('nvidia:')) {
        primaryProvider = 'nvidia';
        rawPrimaryModel = rawPrimaryModel.slice('nvidia:'.length);
      }
      const primaryModel = rawPrimaryModel;
      attempts.push({ provider: primaryProvider, model: primaryModel });

      // Fallbacks globais da Config (ai_fallback_0, ai_fallback_1, ai_fallback_2)
      for (let i = 0; i < 3; i++) {
        const fb = await settingsService.get(tenantId, `ai_fallback_${i}`);
        if (fb && fb.includes('|')) {
          const [provider, model] = fb.split('|');
          if (provider && model) attempts.push({ provider, model });
        }
      }

      // Fallback config do agente (fallbackConfig Json)
      const fallbackConfig = ((agent as any)?.fallbackConfig || []) as ProviderAttempt[];
      for (const fb of fallbackConfig) {
        if (fb.provider && fb.model) attempts.push(fb);
      }

      // Legacy fallbackModels (string[] via OpenRouter)
      for (const m of (agent?.fallbackModels || [])) {
        attempts.push({ provider: 'openrouter', model: m });
      }

      // Modelos passados como parâmetro (fallback final via OpenRouter)
      for (const m of (models || [])) {
        attempts.push({ provider: 'openrouter', model: m });
      }

      // Economy mode: injeta modelos baratos/grátis no topo
      if (agent?.economyMode) {
        const economyModels = [
          { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
          { provider: 'openrouter', model: 'google/gemini-2.0-flash-exp:free' },
        ];
        attempts.unshift(...economyModels);
      }

      // Deduplica
      const seen = new Set<string>();
      const uniqueAttempts = attempts.filter(a => {
        const key = `${a.provider}:${a.model}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 5);
      const hasToolMessages = messages.some((message: any) => message?.role === 'tool' || message?.tool_call_id);
      const toolCompatibleAttempts = uniqueAttempts.filter((attempt) =>
        ['openrouter', 'openai', 'deepseek', 'moonshot', 'zhipu', 'nvidia'].includes(attempt.provider)
      );
      const providerAttempts = hasToolMessages && toolCompatibleAttempts.length > 0
        ? toolCompatibleAttempts
        : uniqueAttempts;

      // 5. Tentar cada provider/model sequencialmente até um funcionar
      let lastError = '';
      let data: any = null;
      let usedProvider = '';
      const baseMaxOutputTokens = this.calculateMaxOutputTokens(finalMessages, estimatedTokens);

      for (const attempt of providerAttempts) {
        const adapter = PROVIDERS[attempt.provider];
        if (!adapter) { lastError = `Provedor "${attempt.provider}" não suportado`; continue; }

        const settingKey = PROVIDER_SETTING_KEYS[attempt.provider];
        const apiKey = await settingsService.get(tenantId, settingKey);
        if (!apiKey) { lastError = `Chave não configurada para ${attempt.provider}`; continue; }

        const endpoint = adapter.getEndpoint(attempt.model);
        const headers = adapter.getHeaders(apiKey);
        let maxOutputTokens = baseMaxOutputTokens;
        let body = adapter.formatBody(finalMessages, attempt.model, tools, maxOutputTokens);

        // Kimi K2.5 no Thinking Mode pode demorar mais que 30s - usa timeout maior para NVIDIA
        const defaultTimeout = attempt.provider === 'nvidia' ? '90' : '30';
        const timeoutSec = parseInt(await settingsService.get(tenantId, 'ai_timeout') || defaultTimeout) || parseInt(defaultTimeout);

        try {
          let response = await this.fetchWithTimeout(endpoint, headers, body, timeoutSec);

          if (!response.ok) {
            let errorText = await response.text();
            const affordableTokens = this.extractAffordableTokens(errorText);

            if (response.status === 402 && affordableTokens && affordableTokens >= 128 && affordableTokens < maxOutputTokens) {
              maxOutputTokens = Math.max(128, affordableTokens - 40); // Margem de segurança maior
              body = adapter.formatBody(finalMessages, attempt.model, tools, maxOutputTokens);
              console.warn(`[AIService] Repetindo ${attempt.provider}/${attempt.model} com max_tokens=${maxOutputTokens} por limite de crédito.`);
              response = await this.fetchWithTimeout(endpoint, headers, body, timeoutSec);

              if (response.ok) {
                data = await response.json();
                usedProvider = attempt.provider;
                console.log(`[AIService] ${attempt.provider}/${attempt.model} respondeu apos ajuste de max_tokens`);
                break;
              }

              errorText = await response.text();
            }
            const shortError = errorText.slice(0, 200);
            if (response.status === 402) {
              lastError = `Sem créditos em ${attempt.provider} (modelo: ${attempt.model}). Detalhes: ${shortError}`;
            } else if (response.status === 429) {
              lastError = `Rate limit atingido em ${attempt.provider}/${attempt.model}`;
            } else {
              lastError = `${attempt.provider}/${attempt.model}: ${response.status} - ${shortError}`;
            }
            console.warn(`[AIService] Fallback: ${lastError}`);
            continue; // Tenta próximo
          }

          data = await response.json();
          usedProvider = attempt.provider;
          console.log(`[AIService] ✅ ${attempt.provider}/${attempt.model} respondeu`);
          break; // Sucesso!
        } catch (fetchErr: any) {
          if (fetchErr.name === 'AbortError') {
            lastError = `Timeout 30s em ${attempt.provider}/${attempt.model}`;
            console.warn(`[AIService] ${lastError}`);
            continue;
          }
          lastError = `${attempt.provider}/${attempt.model}: ${fetchErr.message}`;
          console.warn(`[AIService] Fallback: ${lastError}`);
          continue;
        }
      }

      if (!data) {
        return { content: `⚠️ Todos os modelos falharam. Último erro: ${lastError}`, model: 'error', tokensUsed: 0 };
      }

      // Parsear resposta com o adapter correto
      const adapter = PROVIDERS[usedProvider];
      const parsed = adapter.parseResponse(data);
      const message = {
        role: 'assistant' as const,
        content: parsed.content || '',
        tool_calls: parsed.toolCalls?.length ? parsed.toolCalls : undefined,
      };

      // Log para debug
      if (!message.content && !message.tool_calls) {
        console.warn(`[AIService] ⚠️ Resposta vazia de ${usedProvider}/${parsed.model}. Data:`, JSON.stringify(data).slice(0, 300));
      }

      // 6. Tratamento de Tool Calls (dinâmico via SkillRegistry)
      if (message.tool_calls) {
        console.log(`🛠️ [SKILLS] Agente ${agent?.name} solicitou: ${message.tool_calls.map((tc: any) => tc.function.name).join(', ')}`);

        const toolResults = await Promise.all(message.tool_calls.map(async (toolCall: any) => {
          const { name, arguments: args } = toolCall.function;
          const parsedArgs = JSON.parse(args);

          let result = '';
          try {
            // Skills nativas com lógica especial
            if (name === 'web_search') {
              const { WebSearchService } = await import('./web-search.service.js');
              const searchRes = await WebSearchService.search(parsedArgs.query);
              result = searchRes.length > 0
                ? JSON.stringify(searchRes.map(r => `${r.title}: ${r.snippet} (${r.url})`))
                : 'Nenhum resultado encontrado na web.';
            } else if (name === 'knowledge_search') {
              const knowledge = await KnowledgeService.search(tenantId, agentId, parsedArgs.query);
              result = knowledge.length > 0
                ? knowledge.map(k => k.content).join('\n')
                : 'Nenhuma informação relevante encontrada na base de conhecimento.';
            } else if (name === 'escalate_human') {
              const { EscalationService } = await import('./escalation.service.js');
              const contactId = (messages as any).contactId || 'unknown';
              const escRes = await EscalationService.create(tenantId, agentId, contactId, parsedArgs.reason, messages[messages.length-1].content);
              result = `[SISTEMA]: Chamado de escalação criado: ${escRes.escalationId}. Informe ao usuário que um humano o ajudará em breve.`;
            } else if (name === 'scrape_url') {
              const urlRes = await fetch(parsedArgs.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LumiPlusBot/1.0)' },
                signal: AbortSignal.timeout(10000)
              });
              const html = await urlRes.text();
              const text = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 4000);
              result = text || 'Não foi possível extrair conteúdo da URL.';
            } else if (name === 'write_memory') {
              await KnowledgeService.save(tenantId, agentId, {
                title: parsedArgs.title,
                content: parsedArgs.content
              });
              result = `Memória "${parsedArgs.title}" salva com sucesso.`;
            } else {
              // Delega para SkillRegistry (duckduckgo, self_improving, trello, etc)
              result = await SkillRegistry.execute(name, parsedArgs, { tenantId, agentId, credentials: {} });
            }
          } catch (e: any) {
            result = `Erro ao executar ${name}: ${e.message}`;
          }

          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          };
        }));

        // Chamar a IA novamente com os resultados das ferramentas
        return this.complete(tenantId, agentId, [...messages, message, ...toolResults as any], models, channel);
      }

      const aiRes = {
        content: message.content || 'Desculpe, não consegui gerar uma resposta. Tente novamente.',
        model: parsed.model || usedProvider,
        tokensUsed: parsed.tokensUsed || 0
      };

      const interactionId = await this.logInteraction(tenantId, agentId, messages, aiRes, contextUsed, Date.now() - startTime).catch(() => undefined);
      return { ...aiRes, interactionId };

    } catch (error: any) {
      this.logInteraction(tenantId, agentId, messages, null, contextUsed, Date.now() - startTime, 'error', error.message).catch(e => {});
      return { content: "Erro técnico ao processar resposta.", model: 'error', tokensUsed: 0 };
    }
  }

  private static calculateMaxOutputTokens(messages: ChatMessage[], estimatedTokens?: number) {
    const promptTokens = estimatedTokens ?? messages.reduce((acc, message) => acc + Math.ceil(message.content.length / 4), 0);
    if (promptTokens >= 3200) return 300;
    if (promptTokens >= 2400) return 400;
    if (promptTokens >= 1600) return 500;
    return 750; // Reduzido de 850 para ser mais seguro com créditos residuais
  }

  private static extractAffordableTokens(errorText: string) {
    const match = errorText.match(/can only afford (\d+)/i);
    return match ? Number(match[1]) : null;
  }

  private static async fetchWithTimeout(
    endpoint: string,
    headers: Record<string, string>,
    body: any,
    timeoutSec: number
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async logInteraction(
    tenantId: string,
    agentId: string,
    input: any,
    output: any,
    context: string,
    latency: number,
    status: string = 'success',
    error?: string
  ): Promise<string | undefined> {
    const record = await prisma.agentInteraction.create({
      data: {
        tenantId,
        agentId,
        input,
        output: output || {},
        contextUsed: context,
        modelSelected: output?.model || 'unknown',
        tokensUsed: output?.tokensUsed || 0,
        latencyMs: latency,
        status,
        errorMessage: error
      }
    });
    return record.id;
  }
}
