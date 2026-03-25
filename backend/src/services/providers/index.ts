/**
 * Multi-Provider AI Adapters
 * Strategy Pattern — cada provedor implementa formatRequest/parseResponse
 *
 * Providers OpenAI-compatible: OpenRouter, OpenAI, DeepSeek, Moonshot, Zhipu, NVIDIA NIM
 * Providers com formato próprio: Anthropic (Claude), Google (Gemini)
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface ProviderResponse {
  content: string;
  model: string;
  tokensUsed: number;
  toolCalls?: any[];
}

export interface ProviderAdapter {
  name: string;
  getEndpoint(model: string): string;
  getHeaders(apiKey: string): Record<string, string>;
  formatBody(messages: ChatMessage[], model: string, tools?: AITool[], maxTokens?: number): any;
  parseResponse(data: any): ProviderResponse;
}

// ── OpenAI-Compatible (OpenRouter, OpenAI, DeepSeek, Moonshot, Zhipu) ──

const openAICompatible = (name: string, baseUrl: string, extraHeaders?: (key: string) => Record<string, string>): ProviderAdapter => ({
  name,
  getEndpoint: () => `${baseUrl}/chat/completions`,
  getHeaders: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(extraHeaders?.(apiKey) || {}),
  }),
  formatBody: (messages, model, tools, maxTokens = 1000) => ({
    model,
    messages,
    ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    max_tokens: maxTokens,
  }),
  parseResponse: (data) => ({
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || '',
    tokensUsed: data.usage?.total_tokens || 0,
    toolCalls: data.choices?.[0]?.message?.tool_calls,
  }),
});

export const openRouterAdapter: ProviderAdapter = {
  ...openAICompatible('openrouter', 'https://openrouter.ai/api/v1'),
  getHeaders: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://lumiplus.ai',
    'X-Title': 'Lumi Plus Agent Platform',
    'Content-Type': 'application/json',
  }),
  // OpenRouter suporta `models` (array) para fallback automático
  formatBody: (messages, model, tools, maxTokens = 1000) => ({
    model,
    messages,
    ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    max_tokens: maxTokens,
  }),
};

export const openAIAdapter = openAICompatible('openai', 'https://api.openai.com/v1');
export const deepSeekAdapter = openAICompatible('deepseek', 'https://api.deepseek.com/v1');
export const moonshotAdapter = openAICompatible('moonshot', 'https://api.moonshot.cn/v1');
export const zhipuAdapter = openAICompatible('zhipu', 'https://open.bigmodel.cn/api/paas/v4');

// ── NVIDIA NIM — OpenAI-compatible com suporte a Kimi K2.5 Thinking Mode ──

/**
 * Modelos NIM com thinking mode. Kimi K2.5 suporta dois modos:
 * - Thinking (padrão): reasoning traces, temp=1.0, top_p=0.95
 * - Instant: respostas diretas, temp=0.6
 */
const NIM_THINKING_MODELS = new Set([
  'moonshotai/kimi-k2.5',
]);

export const nvidiaAdapter: ProviderAdapter = {
  name: 'nvidia',
  getEndpoint: () => 'https://integrate.api.nvidia.com/v1/chat/completions',
  getHeaders: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }),
  formatBody: (messages, model, tools, maxTokens = 2048) => {
    const isThinkingModel = NIM_THINKING_MODELS.has(model);
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      // Temperatura recomendada pela NVIDIA para cada modo
      temperature: isThinkingModel ? 1.0 : 0.6,
      top_p: isThinkingModel ? 0.95 : 0.7,
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    };
    // Kimi K2.5: thinking mode ativo por padrão (mais poderoso)
    // Para instant mode, o usuário pode passar thinking=false em extra_body
    if (isThinkingModel) {
      body.stream = false;
    }
    return body;
  },
  parseResponse: (data) => {
    const choice = data.choices?.[0];
    const message = choice?.message;
    // Kimi K2.5 retorna reasoning_content separado do content no thinking mode
    const thinkingContent = message?.reasoning_content
      ? `<think>${message.reasoning_content}</think>\n\n`
      : '';
    return {
      content: thinkingContent + (message?.content || ''),
      model: data.model || '',
      tokensUsed: data.usage?.total_tokens || 0,
      toolCalls: message?.tool_calls,
    };
  },
};

// ── Anthropic (Claude) — formato próprio ──

export const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',
  getEndpoint: () => 'https://api.anthropic.com/v1/messages',
  getHeaders: (apiKey) => ({
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }),
  formatBody: (messages, model, tools, maxTokens = 1024) => {
    // Claude separa system prompt dos messages
    const systemMsgs = messages.filter(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');
    const systemText = systemMsgs.map(m => m.content).join('\n\n');

    return {
      model,
      ...(systemText ? { system: systemText } : {}),
      messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
      ...(tools?.length ? {
        tools: tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }))
      } : {}),
      max_tokens: maxTokens,
    };
  },
  parseResponse: (data) => ({
    content: data.content?.map((c: any) => c.text || '').join('') || '',
    model: data.model || '',
    tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    toolCalls: data.content?.filter((c: any) => c.type === 'tool_use').map((c: any) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.input) },
    })),
  }),
};

// ── Google Gemini — formato próprio ──

export const geminiAdapter: ProviderAdapter = {
  name: 'google',
  getEndpoint: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  getHeaders: (apiKey) => ({
    'x-goog-api-key': apiKey,
    'Content-Type': 'application/json',
  }),
  formatBody: (messages, _model, tools, maxTokens = 1000) => {
    const systemMsgs = messages.filter(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');
    const systemText = systemMsgs.map(m => m.content).join('\n\n');

    return {
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      contents: nonSystemMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      ...(tools?.length ? {
        tools: [{
          functionDeclarations: tools.map(t => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          })),
        }],
      } : {}),
      generationConfig: { maxOutputTokens: maxTokens },
    };
  },
  parseResponse: (data) => {
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
    const fnParts = parts.filter((p: any) => p.functionCall);

    return {
      content: textParts.join('') || '',
      model: data.modelVersion || '',
      tokensUsed: (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0),
      toolCalls: fnParts.length ? fnParts.map((p: any) => ({
        type: 'function',
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) },
      })) : undefined,
    };
  },
};

// ── Registry ──

export const PROVIDERS: Record<string, ProviderAdapter> = {
  openrouter: openRouterAdapter,
  openai: openAIAdapter,
  anthropic: anthropicAdapter,
  google: geminiAdapter,
  deepseek: deepSeekAdapter,
  moonshot: moonshotAdapter,
  zhipu: zhipuAdapter,
  nvidia: nvidiaAdapter,
};

/** Chave de WorkspaceSetting para cada provedor */
export const PROVIDER_SETTING_KEYS: Record<string, string> = {
  openrouter: 'openrouter_key',
  openai: 'openai_key',
  anthropic: 'anthropic_key',
  google: 'google_ai_key',
  deepseek: 'deepseek_key',
  moonshot: 'moonshot_key',
  zhipu: 'zhipu_key',
  nvidia: 'nvidia_nim_key',
};
