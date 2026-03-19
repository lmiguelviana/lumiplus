'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, KeyRound, Save, Search, Server, Shield, MessageSquare, AtSign, Globe, Loader2, CheckCircle2, ChevronDown, Cpu } from 'lucide-react';
import api from '@/lib/api';

interface SettingsData {
  [key: string]: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings');
      setSettings(res.data.settings || {});
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSavedKeys(prev => ({ ...prev, [key]: false }));
  };

  const handleSave = async (key: string) => {
    try {
      setSaving(key);
      await api.put(`/settings/${key}`, { value: settings[key] });
      setSavedKeys(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setSavedKeys(prev => ({ ...prev, [key]: false })), 2500);
      fetchSettings();
    } catch {
      alert('Erro ao salvar configuração.');
    } finally {
      setSaving(null);
    }
  };

  const toggleShowToken = async (key: string) => {
    const isMasked = settings[key]?.startsWith('••••••••');

    if (isMasked && !revealedKeys[key]) {
      try {
        setRevealing(prev => ({ ...prev, [key]: true }));
        const res = await api.get(`/settings/${key}/reveal`);
        setRevealedKeys(prev => ({ ...prev, [key]: res.data.value }));
        setShowTokens(prev => ({ ...prev, [key]: true }));
      } catch {
        alert('Erro ao revelar chave.');
      } finally {
        setRevealing(prev => ({ ...prev, [key]: false }));
      }
    } else if (isMasked && revealedKeys[key]) {
      if (showTokens[key]) {
        setShowTokens(prev => ({ ...prev, [key]: false }));
        setRevealedKeys(prev => { const c = { ...prev }; delete c[key]; return c; });
      } else {
        setShowTokens(prev => ({ ...prev, [key]: true }));
      }
    } else {
      setShowTokens(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const renderKeyField = (key: string, label: string, placeholder: string, desc: string, icon: React.ReactNode) => {
    const isMasked = settings[key]?.startsWith('••••••••');
    const displayValue = (showTokens[key] && revealedKeys[key]) ? revealedKeys[key] : settings[key] || '';
    const isRevealed = showTokens[key] && (revealedKeys[key] || !isMasked);
    const isSaving = saving === key;
    const isSaved = savedKeys[key];
    const canSave = !isMasked && !!settings[key] && !isSaving;

    return (
      <div className="group py-5 first:pt-0 last:pb-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary">{icon}</span>
          <span className="font-black text-xs uppercase tracking-widest">{label}</span>
          {isMasked && (
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-green-600/10 text-green-600 dark:bg-green-500/10 dark:text-green-400 border border-green-600/20 dark:border-green-500/20">
              Configurado
            </span>
          )}
        </div>
        <p className="text-xs text-foreground/50 mb-3">{desc}</p>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type={isRevealed ? 'text' : 'password'}
              value={displayValue}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={placeholder}
              className="w-full h-10 px-3 pr-10 text-sm font-mono bg-surface border border-border-strong focus:border-primary focus:outline-none transition-colors placeholder:text-foreground/25"
              style={{ borderRadius: 0 }}
              onFocus={() => {
                if (isMasked) {
                  handleChange(key, '');
                  setRevealedKeys(prev => { const c = { ...prev }; delete c[key]; return c; });
                  setShowTokens(prev => ({ ...prev, [key]: false }));
                }
              }}
            />
            <button
              type="button"
              onClick={() => toggleShowToken(key)}
              disabled={revealing[key]}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-foreground/40 hover:text-primary transition-colors disabled:opacity-30"
            >
              {revealing[key] ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isRevealed ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <button
            onClick={() => handleSave(key)}
            disabled={!canSave}
            className="btn-accent flex items-center gap-1.5 h-10 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isSaved ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {isSaved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-3" />
        <span className="font-bold text-xs uppercase tracking-widest text-foreground/50">Carregando cofre de chaves...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 pt-10 pb-20 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter italic">
              Settings <span className="text-primary italic">&amp; BYOK</span>
            </h1>
          </div>
        </div>
        <p className="text-sm text-foreground/50 mt-2 max-w-2xl">
          Gerencie as integrações do Lumi Plus. As chaves são criptografadas com <strong className="text-foreground/70">AES-256-GCM</strong> antes de serem armazenadas no banco de dados.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Provedor de IA ── */}
        <div className="industrial-card">
          <div className="flex items-center gap-2 mb-1 pb-4 border-b border-border-strong">
            <Cpu className="w-4 h-4 text-primary" />
            <h2 className="font-black text-xs uppercase tracking-widest">Provedor de IA</h2>
          </div>

          {/* Dropdown provedor */}
          <div className="py-4 space-y-4">
            <div>
              <label className="font-black text-[10px] uppercase tracking-widest text-foreground/70 mb-1.5 block">Provedor Principal</label>
              <select
                value={settings['ai_provider'] || 'openrouter'}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings(prev => ({ ...prev, ai_provider: val }));
                  api.put('/settings/ai_provider', { value: val }).catch(() => {});
                }}
                className="w-full h-10 px-3 text-sm font-mono bg-surface border border-border-strong focus:border-primary focus:outline-none transition-colors appearance-none cursor-pointer"
                style={{ borderRadius: 0 }}
              >
                <option value="openrouter">OpenRouter — Gateway Universal (+300 modelos)</option>
                <option value="anthropic">Anthropic — Claude (Opus, Sonnet, Haiku)</option>
                <option value="google">Google — Gemini (2.5 Flash/Pro)</option>
                <option value="openai">OpenAI — GPT (4o, O3, O4)</option>
                <option value="deepseek">DeepSeek — V3, R1</option>
              </select>
            </div>

            {/* Modelo padrão */}
            <div>
              <label className="font-black text-[10px] uppercase tracking-widest text-foreground/70 mb-1.5 block">Modelo Padrão</label>
              <select
                value={settings['ai_default_model'] || 'google/gemini-2.0-flash-001'}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings(prev => ({ ...prev, ai_default_model: val }));
                  api.put('/settings/ai_default_model', { value: val }).catch(() => {});
                }}
                className="w-full h-10 px-3 text-sm font-mono bg-surface border border-border-strong focus:border-primary focus:outline-none transition-colors appearance-none cursor-pointer"
                style={{ borderRadius: 0 }}
              >
                {(settings['ai_provider'] || 'openrouter') === 'openrouter' && (
                  <>
                    <optgroup label="Premium">
                      <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                      <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="openai/gpt-4o">GPT-4o</option>
                      <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                      <option value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6</option>
                      <option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5</option>
                      <option value="deepseek/deepseek-chat">DeepSeek V3</option>
                      <option value="moonshotai/kimi-k2.5">Kimi K2.5</option>
                    </optgroup>
                    <optgroup label="Gratuitos">
                      <option value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash (Gratis)</option>
                      <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (Gratis)</option>
                      <option value="qwen/qwen3-235b-a22b:free">Qwen3 235B (Gratis)</option>
                      <option value="moonshotai/kimi-k2:free">Kimi K2 (Gratis)</option>
                      <option value="deepseek/deepseek-chat-v3-0324:free">DeepSeek V3 (Gratis)</option>
                      <option value="mistralai/mistral-small-3.1-24b:free">Mistral Small (Gratis)</option>
                    </optgroup>
                  </>
                )}
                {(settings['ai_provider']) === 'anthropic' && (
                  <>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                  </>
                )}
                {(settings['ai_provider']) === 'google' && (
                  <>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </>
                )}
                {(settings['ai_provider']) === 'openai' && (
                  <>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="o4-mini">O4 Mini</option>
                  </>
                )}
                {(settings['ai_provider']) === 'deepseek' && (
                  <>
                    <option value="deepseek-chat">DeepSeek V3</option>
                    <option value="deepseek-reasoner">DeepSeek R1</option>
                  </>
                )}
              </select>
            </div>

            {/* Fallbacks — IA nunca cai */}
            <div className="pt-3 border-t border-border-strong space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-black text-[10px] uppercase tracking-widest text-foreground/70">Fallbacks (se a IA principal falhar)</label>
                <span className="text-[9px] text-muted/50 font-mono">Até 3 fallbacks</span>
              </div>

              {[0, 1, 2].map(idx => {
                const fbKey = `ai_fallback_${idx}`;
                const val = settings[fbKey] || '';
                return (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-[9px] font-black text-muted w-6 shrink-0">FB{idx + 1}</span>
                    <select
                      value={val.split('|')[0] || ''}
                      onChange={(e) => {
                        const provider = e.target.value;
                        const model = val.split('|')[1] || '';
                        const newVal = provider ? `${provider}|${model}` : '';
                        setSettings(prev => ({ ...prev, [fbKey]: newVal }));
                        api.put(`/settings/${fbKey}`, { value: newVal }).catch(() => {});
                      }}
                      className="flex-1 h-8 px-2 text-[11px] font-mono bg-surface border border-border-strong focus:border-primary focus:outline-none appearance-none"
                      style={{ borderRadius: 0 }}
                    >
                      <option value="">— Desativado —</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google</option>
                      <option value="openai">OpenAI</option>
                      <option value="deepseek">DeepSeek</option>
                    </select>
                    <select
                      value={val.split('|')[1] || ''}
                      onChange={(e) => {
                        const provider = val.split('|')[0] || '';
                        const newVal = provider ? `${provider}|${e.target.value}` : '';
                        setSettings(prev => ({ ...prev, [fbKey]: newVal }));
                        api.put(`/settings/${fbKey}`, { value: newVal }).catch(() => {});
                      }}
                      className="flex-1 h-8 px-2 text-[11px] font-mono bg-surface border border-border-strong focus:border-primary focus:outline-none appearance-none"
                      style={{ borderRadius: 0 }}
                    >
                      <option value="">— Modelo —</option>
                      {(val.split('|')[0] || '') === 'openrouter' && (
                        <>
                          <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                          <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                          <option value="anthropic/claude-haiku-4-5">Claude Haiku</option>
                          <option value="deepseek/deepseek-chat">DeepSeek V3</option>
                          <option value="google/gemini-2.0-flash-exp:free">Gemini Flash (Gratis)</option>
                          <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 (Gratis)</option>
                          <option value="qwen/qwen3-235b-a22b:free">Qwen3 (Gratis)</option>
                        </>
                      )}
                      {(val.split('|')[0]) === 'anthropic' && (
                        <>
                          <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                          <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                        </>
                      )}
                      {(val.split('|')[0]) === 'google' && (
                        <>
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        </>
                      )}
                      {(val.split('|')[0]) === 'openai' && (
                        <>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gpt-4o-mini">GPT-4o Mini</option>
                        </>
                      )}
                      {(val.split('|')[0]) === 'deepseek' && (
                        <>
                          <option value="deepseek-chat">DeepSeek V3</option>
                          <option value="deepseek-reasoner">DeepSeek R1</option>
                        </>
                      )}
                    </select>
                  </div>
                );
              })}

              <p className="text-[9px] text-muted/50 italic">
                Se a IA principal falhar ou der timeout, o sistema tenta o fallback 1, depois o 2, depois o 3. A IA nunca fica offline.
              </p>
            </div>

            {/* Timeout */}
            <div className="pt-3 border-t border-border-strong">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <label className="font-black text-[10px] uppercase tracking-widest text-foreground/70 mb-1.5 block">Timeout por tentativa</label>
                  <select
                    value={settings['ai_timeout'] || '30'}
                    onChange={(e) => {
                      setSettings(prev => ({ ...prev, ai_timeout: e.target.value }));
                      api.put('/settings/ai_timeout', { value: e.target.value }).catch(() => {});
                    }}
                    className="w-full h-10 px-3 text-sm font-mono bg-surface border border-border-strong focus:border-primary focus:outline-none appearance-none"
                    style={{ borderRadius: 0 }}
                  >
                    <option value="10">10 segundos (rápido)</option>
                    <option value="15">15 segundos</option>
                    <option value="30">30 segundos (padrão)</option>
                    <option value="45">45 segundos</option>
                    <option value="60">60 segundos (lento)</option>
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-muted/50 italic mt-1.5">
                Se um modelo não responder dentro do timeout, pula para o próximo fallback automaticamente.
              </p>
            </div>

            {/* Chave do provedor selecionado */}
            <div className="pt-2 border-t border-border-strong">
              {renderKeyField(
                (settings['ai_provider'] || 'openrouter') === 'openrouter' ? 'openrouter_key' :
                (settings['ai_provider']) === 'anthropic' ? 'anthropic_key' :
                (settings['ai_provider']) === 'google' ? 'google_ai_key' :
                (settings['ai_provider']) === 'openai' ? 'openai_key' :
                (settings['ai_provider']) === 'deepseek' ? 'deepseek_key' : 'openrouter_key',

                (settings['ai_provider'] || 'openrouter') === 'openrouter' ? 'OpenRouter API Key' :
                (settings['ai_provider']) === 'anthropic' ? 'Anthropic API Key' :
                (settings['ai_provider']) === 'google' ? 'Google AI Key' :
                (settings['ai_provider']) === 'openai' ? 'OpenAI API Key' :
                (settings['ai_provider']) === 'deepseek' ? 'DeepSeek API Key' : 'API Key',

                (settings['ai_provider'] || 'openrouter') === 'openrouter' ? 'sk-or-v1-...' :
                (settings['ai_provider']) === 'anthropic' ? 'sk-ant-...' :
                (settings['ai_provider']) === 'google' ? 'AIza...' :
                'sk-...',

                'Cole sua chave de API do provedor selecionado.',
                <KeyRound className="w-3.5 h-3.5" />
              )}
            </div>

            {/* Groq separado (transcrição) */}
            <div className="pt-2 border-t border-border-strong">
              {renderKeyField(
                'groq_key',
                'Groq API Key (Opcional)',
                'gsk_...',
                'Transcrição de áudio (Whisper). Usado para mensagens de voz no WhatsApp.',
                <KeyRound className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
        </div>

        {/* Brave Search e Brevo são configurados como credenciais de Skills no marketplace */}

        {/* Aprovação humana usa o canal do próprio agente (WhatsApp/Telegram/Instagram da página Canais) */}

      </div>
    </div>
  );
}
