'use client';

import React, { useState, useEffect } from 'react';
import {
  Bot,
  Plus,
  Settings2,
  ShieldCheck,
  Cpu,
  MessageSquare,
  Globe,
  Trash2,
  ExternalLink,
  Save,
  X,
  Loader2,
  Zap,
  Sparkles,
  Upload,
  Clock,
  Play,
  Pause,
  RotateCw,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface Agent {
  id: string;
  name: string;
  slug: string;
  mission: string;
  systemPrompt?: string;
  model: string; // Mapeado para primaryModel
  fallbackModels: string[];
  economyMode: boolean;
  status: 'online' | 'offline' | 'training';
  interactions: number;
  // Fase 28: Grupos
  groupEnabled?: boolean;
  groupActivation?: string;
  groupMentionPatterns?: string[];
  groupKeywords?: string[];
  groupCooldown?: number;
  groupHistoryLimit?: number;
  // Fase 29: Acesso
  accessMode?: string;
  accessAllowlist?: string[];
  accessBlocklist?: string[];
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    mission: '',
    model: 'google/gemini-2.0-flash-001'
  });
  const [soulContent, setSoulContent] = useState('');
  const [soulLoading, setSoulLoading] = useState(false);
  const [soulSaving, setSoulSaving] = useState(false);
  const [soulSaved, setSoulSaved] = useState(false);

  // CronJobs
  interface CronJob {
    id: string;
    name: string;
    prompt: string;
    schedule: string;
    timezone: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastResult: string | null;
  }
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [cronsLoading, setCronsLoading] = useState(false);
  const [newCron, setNewCron] = useState({ name: '', prompt: '', schedule: '0 9 * * *' });
  const [showCronForm, setShowCronForm] = useState(false);
  const [cronSaving, setCronSaving] = useState(false);

  useEffect(() => {
    async function loadAgents() {
      try {
        const response = await api.get('/dashboard/agents');
        setAgents(response.data);
      } catch (error) {
        console.error('Erro ao buscar agentes:', error);
      } finally {
        setLoading(false);
      }
    }
    loadAgents();
  }, []);

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await api.post('/dashboard/agents', newAgent);
      setAgents(prev => [...prev, {
        ...response.data,
        model: response.data.primaryModel,
        interactions: 0,
        status: 'online'
      }]);
      setIsCreating(false);
      setNewAgent({ name: '', mission: '', model: 'google/gemini-2.0-flash-001' });
      alert('Novo Cérebro implantado com sucesso! 🧠✨');
    } catch (error) {
      alert('Falha ao implantar novo núcleo.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = async (agent: Agent) => {
    setEditingAgent(agent);
    setSoulContent('');
    setSoulSaved(false);
    setSoulLoading(true);
    setCrons([]);
    setCronsLoading(true);
    setShowCronForm(false);
    setNewCron({ name: '', prompt: '', schedule: '0 9 * * *' });
    try {
      const res = await api.get(`/knowledge/${agent.id}/soul`);
      setSoulContent(res.data.soul || '');
    } catch (_) {}
    setSoulLoading(false);
    try {
      const res = await api.get(`/crons/${agent.id}`);
      setCrons(res.data.crons || []);
    } catch (_) {}
    setCronsLoading(false);
  };

  const handleCreateCron = async () => {
    if (!editingAgent || !newCron.name || !newCron.prompt) return;
    setCronSaving(true);
    try {
      const res = await api.post(`/crons/${editingAgent.id}`, newCron);
      setCrons(prev => [res.data, ...prev]);
      setNewCron({ name: '', prompt: '', schedule: '0 9 * * *' });
      setShowCronForm(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao criar agendamento');
    } finally {
      setCronSaving(false);
    }
  };

  const handleToggleCron = async (cronId: string, enabled: boolean) => {
    if (!editingAgent) return;
    try {
      await api.patch(`/crons/${editingAgent.id}/${cronId}`, { enabled });
      setCrons(prev => prev.map(c => c.id === cronId ? { ...c, enabled } : c));
    } catch (_) {}
  };

  const handleDeleteCron = async (cronId: string) => {
    if (!editingAgent) return;
    try {
      await api.delete(`/crons/${editingAgent.id}/${cronId}`);
      setCrons(prev => prev.filter(c => c.id !== cronId));
    } catch (_) {}
  };

  const handleRunCron = async (cronId: string) => {
    if (!editingAgent) return;
    try {
      await api.post(`/crons/${editingAgent.id}/${cronId}/run`);
      alert('Agendamento disparado manualmente!');
    } catch (_) {
      alert('Erro ao disparar agendamento');
    }
  };

  const handleSaveSoul = async () => {
    if (!editingAgent) return;
    setSoulSaving(true);
    try {
      await api.post(`/knowledge/${editingAgent.id}/soul`, { content: soulContent });
      setSoulSaved(true);
      setTimeout(() => setSoulSaved(false), 2000);
    } catch (_) {
      alert('Erro ao salvar SOUL.md');
    } finally {
      setSoulSaving(false);
    }
  };

  const handleUpdateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;
    
    setSaving(true);
    try {
      const response = await api.patch(`/dashboard/agents/${editingAgent.id}`, {
        ...editingAgent,
        primaryModel: editingAgent.model,
      });
      setAgents(prev => prev.map(a => a.id === editingAgent.id ? { 
        ...a, 
        ...response.data, 
        model: response.data.primaryModel,
        fallbackModels: response.data.fallbackModels,
        economyMode: response.data.economyMode
      } : a));
      setEditingAgent(null);
      alert('Núcleo de Inteligência atualizado com sucesso! 🧠✨');
    } catch (error) {
      alert('Falha ao sincronizar alterações com o núcleo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-1 bg-primary animate-pulse" />
        <p className="font-black uppercase tracking-[0.2em] text-xs opacity-50">Loading Intelligence Cores...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      {/* Header Section */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-l-4 border-primary pl-6 py-2">
        <div>
          <h2 className="text-5xl font-black tracking-tighter uppercase italic">
            Agentes <span className="text-primary italic">Management</span>
          </h2>
          <p className="text-muted font-bold uppercase tracking-widest text-xs mt-2">
            Configure e Treine seus Cérebros Digitais
          </p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="btn-accent flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Criar Novo Agente
        </button>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-px bg-border-strong border border-border-strong">
        {agents.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, type: 'spring', damping: 25 }}
            className="bg-surface p-8 relative group hover:bg-background transition-colors"
          >
            {/* Corner Status */}
            <div className="absolute top-0 right-0 p-1">
              <div className={cn(
                "w-16 h-1 bg-border-strong group-hover:bg-primary transition-colors",
                agent.status === 'online' ? "bg-green-500" : "bg-muted"
              )} />
            </div>

            <div className="flex flex-col sm:flex-row gap-8 items-start">
              <div className="w-20 h-20 bg-foreground/5 flex items-center justify-center border border-border-strong group-hover:border-primary transition-colors">
                <Bot className="w-10 h-10 text-primary" />
              </div>
              
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-3xl font-black tracking-tighter uppercase">{agent.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditModal(agent)}
                        className="p-1.5 border border-border-strong hover:bg-primary hover:text-white transition-all"
                      >
                        <Settings2 className="w-3 h-3" />
                      </button>
                      <button className="p-1.5 border border-border-strong hover:bg-red-600 hover:text-white transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary italic">@{agent.slug}</span>
                  <div className="w-1 h-1 bg-muted rounded-full" />
                  <span className="text-[10px] font-bold uppercase text-muted tracking-widest">{agent.status}</span>
                </div>

                <p className="text-sm font-bold opacity-70 leading-relaxed text-balance">
                  {agent.mission}
                </p>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-8 mt-10 pt-8 border-t border-border-strong/10">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted">
                  <Cpu className="w-3 h-3" />
                  <span className="text-[9px] uppercase font-black tracking-tighter">Model Stack</span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-tight text-foreground">{agent.model}</p>
                  {agent.economyMode && (
                    <span className="text-[8px] font-black bg-green-500/10 text-green-500 px-1 border border-green-500/20">CUSTO REDUZIDO</span>
                  )}
                </div>
              </div>
              <div className="space-y-1 border-l border-border-strong/10 pl-8">
                <div className="flex items-center gap-2 text-muted">
                  <MessageSquare className="w-3 h-3" />
                  <span className="text-[9px] uppercase font-black tracking-tighter">Activity</span>
                </div>
                <p className="text-xs font-black">{agent.interactions.toLocaleString()}</p>
              </div>
              <div className="space-y-1 border-l border-border-strong/10 pl-8">
                <div className="flex items-center gap-2 text-muted">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="text-[9px] uppercase font-black tracking-tighter">Access Context</span>
                </div>
                <div className="flex items-center gap-1">
                  <Globe className="w-3 h-3 text-primary" />
                  <span className="text-[9px] font-black uppercase tracking-tighter">Multi-Tenant Isolated</span>
                </div>
              </div>
            </div>

            <div className="mt-10 flex gap-px bg-border-strong border border-border-strong">
              <button
                onClick={() => window.location.href = '/chat'}
                className="flex-1 py-3 bg-surface hover:bg-foreground hover:text-background transition-all text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2"
              >
                Chat <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => window.location.href = `/skills?agentId=${agent.id}`}
                className="flex-1 py-3 bg-surface hover:bg-foreground hover:text-background transition-all text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2"
              >
                Skills <Sparkles className="w-3 h-3" />
              </button>
              <button
                onClick={() => window.location.href = `/knowledge?agentId=${agent.id}`}
                className="flex-1 py-3 bg-foreground text-background dark:bg-foreground dark:text-background hover:bg-primary dark:hover:bg-primary transition-all text-[10px] font-black uppercase tracking-[0.2em]"
              >
                Training
              </button>
            </div>
          </motion.div>
        ))}

        {/* Add Agent Card */}
        <motion.button 
          onClick={() => setIsCreating(true)}
          whileHover={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
          className="bg-surface border border-border-strong flex flex-col items-center justify-center p-12 transition-all gap-6 min-h-[400px] group"
        >
          <div className="w-16 h-16 border-2 border-dashed border-muted group-hover:border-background flex items-center justify-center">
            <Plus className="w-8 h-8" />
          </div>
          <div className="text-center">
            <h4 className="font-black text-xl uppercase tracking-tighter">New Intelligence Core</h4>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-2 opacity-50">Click to deploy a new brain</p>
          </div>
        </motion.button>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="industrial-card w-full max-w-xl bg-surface border-2 border-primary overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-border-strong flex justify-between items-center bg-foreground/5">
                <h3 className="text-3xl font-black uppercase tracking-tighter leading-none italic">
                  DEPLOING <span className="text-primary">NEW AGENT</span>
                </h3>
                <button onClick={() => setIsCreating(false)} className="p-3 border-2 border-border-strong hover:bg-red-500 hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateAgent} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted tracking-widest">Nome do Agente</label>
                  <input 
                    required
                    placeholder="EX: LUMI HELPER"
                    className="w-full bg-background border border-border-strong p-3 text-sm font-bold uppercase tracking-tight outline-none focus:border-primary"
                    value={newAgent.name}
                    onChange={e => setNewAgent({...newAgent, name: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted tracking-widest">Modelo de Inteligência</label>
                  <select 
                    value={newAgent.model}
                    onChange={e => setNewAgent({...newAgent, model: e.target.value})}
                    className="w-full bg-background border border-border-strong p-3 text-sm font-bold uppercase tracking-tight outline-none focus:border-primary appearance-none cursor-pointer"
                  >
                    <optgroup label="🔥 Premium (via OpenRouter)">
                      <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                      <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="openai/gpt-4o">GPT-4o</option>
                      <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                      <option value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6</option>
                      <option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5</option>
                      <option value="deepseek/deepseek-chat">DeepSeek V3</option>
                      <option value="moonshotai/kimi-k2.5">Kimi K2.5</option>
                    </optgroup>
                    <optgroup label="🆓 Gratuitos (via OpenRouter)">
                      <option value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash (Grátis)</option>
                      <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (Grátis)</option>
                      <option value="qwen/qwen3-235b-a22b:free">Qwen3 235B (Grátis)</option>
                      <option value="moonshotai/kimi-k2:free">Kimi K2 (Grátis)</option>
                      <option value="deepseek/deepseek-chat-v3-0324:free">DeepSeek V3 (Grátis)</option>
                      <option value="mistralai/mistral-small-3.1-24b:free">Mistral Small (Grátis)</option>
                    </optgroup>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted tracking-widest">Missão & Objetivo Principal</label>
                  <textarea 
                    required
                    rows={4}
                    placeholder="EX: AJUDAR USUÁRIOS A ENTENDEREM O SISTEMA..."
                    className="w-full bg-background border border-border-strong p-3 text-sm font-medium tracking-tight outline-none focus:border-primary"
                    value={newAgent.mission}
                    onChange={e => setNewAgent({...newAgent, mission: e.target.value})}
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 py-4 border-2 border-border-strong text-[10px] font-black uppercase hover:bg-foreground/5 transition-all tracking-widest"
                  >
                    CANCEL
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-4 bg-primary text-white text-[10px] font-black uppercase hover:bg-foreground transition-all flex items-center justify-center gap-4 tracking-[0.2em]"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 shadow-[0_0_15px_rgba(var(--primary),0.5)]" />}
                    INIT DEPLOY
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingAgent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="industrial-card w-full max-w-2xl bg-surface border-2 border-primary overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="px-8 py-6 border-b border-border-strong flex justify-between items-center bg-foreground/5">
                <div className="flex items-center gap-6">
                  <div className="hidden sm:block">
                    <h3 className="text-3xl font-black uppercase tracking-tighter leading-none italic">
                      AGENT: <span className="text-primary">{editingAgent.slug}</span>
                    </h3>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-green-500 animate-pulse rounded-full" />
                        <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">STATUS: ONLINE</span>
                      </div>
                      <div className="w-px h-2 bg-muted/30" />
                      <span className="text-[9px] font-black text-muted uppercase tracking-widest">ACTIVE MODEL: <span className="text-foreground">{editingAgent.model}</span></span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setEditingAgent(null)} className="p-3 border-2 border-border-strong hover:bg-red-500 hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleUpdateAgent} className="p-8 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted tracking-widest">Nome do Agente</label>
                    <input 
                      className="w-full bg-background border border-border-strong p-3 text-sm font-bold uppercase tracking-tight outline-none focus:border-primary"
                      value={editingAgent.name}
                      onChange={e => setEditingAgent({...editingAgent, name: e.target.value})}
                    />
                  </div>
                </div>

                {/* Economy Mode — Mockup Styled */}
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-green-500/20 blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative flex items-center justify-between p-6 border-2 border-border-strong bg-surface/80 backdrop-blur-xl">
                    <div className="flex items-center gap-6">
                      <div className={cn(
                        "w-16 h-8 rounded-full transition-all duration-500 relative flex items-center px-1 border-2 border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] cursor-pointer",
                        editingAgent.economyMode ? "bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]" : "bg-muted/30"
                      )}
                      onClick={() => setEditingAgent({...editingAgent, economyMode: !editingAgent.economyMode})}
                      >
                        <div className={cn(
                            "w-5 h-5 bg-white shadow-lg transition-all duration-300 transform",
                            editingAgent.economyMode ? "translate-x-8 scale-110" : "translate-x-0"
                          )}
                        />
                      </div>
                      <div>
                        <h4 className="text-lg font-black uppercase tracking-tighter leading-none">Modo Econômico</h4>
                        <p className={cn(
                          "text-[10px] font-bold uppercase tracking-widest mt-1",
                          editingAgent.economyMode ? "text-green-500" : "text-muted"
                        )}>
                          {editingAgent.economyMode ? 'ON — Prioriza modelos baratos antes do principal' : 'OFF — Usa apenas o modelo configurado'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Model Fallback Chain — Mockup Styled */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-black uppercase text-muted tracking-[0.3em]">AI Model Fallback Chain</h5>
                    <div className="h-px flex-1 mx-4 bg-border-strong/30" />
                  </div>

                  <div className="space-y-2 relative">
                    {/* Visual Connector Line */}
                    <div className="absolute left-[2.45rem] top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary via-green-500 to-transparent opacity-30" />

                    {/* Primary Model Card */}
                    <div className="relative flex items-center gap-4 group">
                      <div className="w-20 h-20 bg-primary/10 border-2 border-primary flex items-center justify-center relative z-10 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                        <Bot className="w-8 h-8 text-primary" />
                        <div className="absolute -bottom-2 -right-2 px-2 py-0.5 bg-primary text-[8px] font-black text-white">CORE</div>
                      </div>
                      <div className="flex-1 p-5 bg-foreground/5 border border-border-strong flex flex-col gap-2 group-hover:border-primary/50 transition-all">
                        <div>
                          <p className="text-[9px] font-black text-muted uppercase tracking-tighter">Primary Intelligence</p>
                          <select 
                            value={editingAgent.model}
                            onChange={e => setEditingAgent({...editingAgent, model: e.target.value})}
                            className="w-full bg-transparent text-xl font-black uppercase tracking-tighter outline-none appearance-none cursor-pointer"
                          >
                            <optgroup label="🔥 Premium">
                              <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                              <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                              <option value="openai/gpt-4o">GPT-4o</option>
                              <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                              <option value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6</option>
                              <option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5</option>
                              <option value="deepseek/deepseek-chat">DeepSeek V3</option>
                              <option value="moonshotai/kimi-k2.5">Kimi K2.5</option>
                            </optgroup>
                            <optgroup label="🆓 Gratuitos">
                              <option value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash (Grátis)</option>
                              <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (Grátis)</option>
                              <option value="qwen/qwen3-235b-a22b:free">Qwen3 235B (Grátis)</option>
                              <option value="moonshotai/kimi-k2:free">Kimi K2 (Grátis)</option>
                              <option value="deepseek/deepseek-chat-v3-0324:free">DeepSeek V3 (Grátis)</option>
                              <option value="mistralai/mistral-small-3.1-24b:free">Mistral Small (Grátis)</option>
                            </optgroup>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[8px] font-black border border-green-500/20 uppercase">ORCHESTRATED VIA OPENROUTER</span>
                          <p className="text-[8px] font-bold text-muted uppercase">Latency: ~1.2s</p>
                        </div>
                      </div>
                    </div>

                    {/* Fallback Flow Arrow */}
                    <div className="flex justify-center py-2 opacity-30">
                      <motion.div animate={{ y: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                        <div className="w-0.5 h-4 bg-muted" />
                      </motion.div>
                    </div>

                    {/* Fallback 1 Card */}
                    <div className="relative flex items-center gap-4 group opacity-70 hover:opacity-100 transition-opacity">
                      <div className="w-20 h-20 bg-surface border border-border-strong flex items-center justify-center relative z-10 grayscale group-hover:grayscale-0">
                        <Cpu className="w-8 h-8 text-muted group-hover:text-foreground" />
                      </div>
                      <div className="flex-1 p-5 bg-foreground/3 border border-dashed border-border-strong flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-muted uppercase tracking-tighter">Secondary Redundancy</p>
                          <h6 className="text-lg font-black uppercase tracking-tighter text-muted">Claude 3.5 Sonnet</h6>
                        </div>
                        <span className="px-2 py-0.5 bg-muted/10 text-muted text-[8px] font-black border border-muted/20">STANDBY</span>
                      </div>
                    </div>

                    {/* Fallback 2 Card (Economy) */}
                    <AnimatePresence>
                      {editingAgent.economyMode && (
                        <motion.div 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="mt-4 p-4 bg-green-500/5 border border-green-500/20 flex items-center gap-4"
                        >
                          <ShieldCheck className="w-5 h-5 text-green-500" />
                          <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest">
                            Ativo: Tenta GPT-4o Mini e Gemini Flash (grátis) antes do modelo principal
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted tracking-widest">Missão & Objetivo</label>
                  <input 
                    className="w-full bg-background border border-border-strong p-3 text-sm font-bold tracking-tight outline-none focus:border-primary"
                    value={editingAgent.mission}
                    onChange={e => setEditingAgent({...editingAgent, mission: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted tracking-widest">System Prompt (O Cérebro 🧠)</label>
                  <textarea
                    rows={6}
                    className="w-full bg-background border border-border-strong p-4 text-sm font-medium tracking-tight outline-none focus:border-primary leading-relaxed"
                    value={editingAgent.systemPrompt || ''}
                    onChange={e => setEditingAgent({...editingAgent, systemPrompt: e.target.value})}
                    placeholder="Defina as regras, personalidade e limites do agente..."
                  />
                </div>

                {/* SOUL.md — Identidade Avançada */}
                <div className="space-y-3 border border-border-strong p-5 bg-background/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <label className="text-[10px] font-black uppercase text-muted tracking-widest">SOUL.md — Alma do Agente</label>
                    </div>
                    {soulLoading && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
                  </div>
                  <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
                    Define personalidade profunda, regras e habilidades. Injetado automaticamente em cada execução.
                  </p>
                  <textarea
                    rows={8}
                    className="w-full bg-background border border-border-strong p-4 text-sm font-mono tracking-tight outline-none focus:border-primary leading-relaxed"
                    value={soulContent}
                    onChange={e => setSoulContent(e.target.value)}
                    placeholder={`# Nome: ${editingAgent?.name || 'Agente'}\n\n## Missão\nDescreva a missão em detalhes...\n\n## Personalidade\nAnalítico, direto, cita fontes sempre.\n\n## Regras\n- Regra 1\n- Regra 2\n\n## Skills Ativas\n- web_search: sim\n- scrape_url: sim`}
                  />
                  <button
                    type="button"
                    onClick={handleSaveSoul}
                    disabled={soulSaving || !soulContent.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all disabled:opacity-40"
                  >
                    {soulSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : soulSaved ? '✓ SALVO' : <><Upload className="w-3 h-3" /> SALVAR SOUL.md</>}
                  </button>
                </div>

                {/* CronJobs — Agendamentos */}
                <div className="space-y-3 border border-border-strong p-5 bg-background/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <label className="text-[10px] font-black uppercase text-muted tracking-widest">Agendamentos (CronJob)</label>
                    </div>
                    {cronsLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCronForm(!showCronForm)}
                        className="flex items-center gap-1 px-3 py-1 bg-primary/10 border border-primary/30 text-primary text-[9px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all"
                      >
                        <Plus className="w-3 h-3" /> Novo
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
                    O agente executa automaticamente no horário configurado. Use formato cron (ex: 0 9 * * * = todo dia às 9h).
                  </p>

                  {/* Form para criar novo cron */}
                  <AnimatePresence>
                    {showCronForm && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 p-4 border border-primary/30 bg-primary/5"
                      >
                        <input
                          placeholder="Nome (ex: Postar conteúdo diário)"
                          className="w-full bg-background border border-border-strong p-2 text-sm font-bold outline-none focus:border-primary"
                          value={newCron.name}
                          onChange={e => setNewCron({ ...newCron, name: e.target.value })}
                        />
                        <textarea
                          rows={3}
                          placeholder="Prompt (ex: Pesquise tendências e crie um post para Instagram)"
                          className="w-full bg-background border border-border-strong p-2 text-sm font-medium outline-none focus:border-primary"
                          value={newCron.prompt}
                          onChange={e => setNewCron({ ...newCron, prompt: e.target.value })}
                        />
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-[8px] font-black uppercase text-muted tracking-widest">Cron Schedule</label>
                            <select
                              className="w-full bg-background border border-border-strong p-2 text-sm font-bold outline-none focus:border-primary appearance-none cursor-pointer"
                              value={newCron.schedule}
                              onChange={e => setNewCron({ ...newCron, schedule: e.target.value })}
                            >
                              <option value="*/30 * * * *">A cada 30 minutos</option>
                              <option value="0 * * * *">A cada hora</option>
                              <option value="0 */2 * * *">A cada 2 horas</option>
                              <option value="0 9 * * *">Todo dia às 09:00</option>
                              <option value="0 9,18 * * *">Às 09:00 e 18:00</option>
                              <option value="0 9 * * 1-5">Seg-Sex às 09:00</option>
                              <option value="0 8 * * 1">Toda segunda às 08:00</option>
                              <option value="0 0 1 * *">Todo dia 1º do mês</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowCronForm(false)}
                            className="px-4 py-2 border border-border-strong text-[9px] font-black uppercase tracking-widest hover:bg-foreground/5 transition-all"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateCron}
                            disabled={cronSaving || !newCron.name || !newCron.prompt}
                            className="px-4 py-2 bg-primary text-white text-[9px] font-black uppercase tracking-widest hover:bg-foreground transition-all disabled:opacity-40 flex items-center gap-2"
                          >
                            {cronSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                            Criar Agendamento
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Lista de crons existentes */}
                  {crons.length === 0 && !cronsLoading && (
                    <p className="text-[10px] text-muted/50 font-bold uppercase tracking-widest py-2">Nenhum agendamento configurado</p>
                  )}
                  {crons.map(c => (
                    <div key={c.id} className={cn(
                      "flex items-center gap-3 p-3 border transition-all",
                      c.enabled ? "border-border-strong bg-surface" : "border-border-strong/50 bg-surface/50 opacity-60"
                    )}>
                      <div
                        className={cn(
                          "w-8 h-8 flex items-center justify-center border cursor-pointer transition-all",
                          c.enabled ? "border-green-500/30 bg-green-500/10" : "border-muted/30 bg-muted/10"
                        )}
                        onClick={() => handleToggleCron(c.id, !c.enabled)}
                        title={c.enabled ? 'Desativar' : 'Ativar'}
                      >
                        {c.enabled ? <Play className="w-3 h-3 text-green-500" /> : <Pause className="w-3 h-3 text-muted" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black uppercase tracking-tight truncate">{c.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8px] font-bold text-muted uppercase tracking-widest">{c.schedule}</span>
                          {c.lastRunAt && (
                            <>
                              <span className="text-[8px] text-muted">•</span>
                              <span className={cn(
                                "text-[8px] font-black uppercase",
                                c.lastResult === 'success' ? 'text-green-500' : c.lastResult === 'error' ? 'text-red-500' : 'text-muted'
                              )}>
                                {c.lastResult === 'success' ? '✓ OK' : c.lastResult === 'error' ? '✗ ERRO' : '—'}
                              </span>
                              <span className="text-[8px] text-muted">{new Date(c.lastRunAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRunCron(c.id)}
                        className="p-1.5 border border-border-strong hover:bg-primary hover:text-white transition-all"
                        title="Rodar agora"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCron(c.id)}
                        className="p-1.5 border border-border-strong hover:bg-red-600 hover:text-white transition-all"
                        title="Remover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Fase 28: Grupos */}
                <div className="space-y-3 border border-border-strong p-5 bg-background/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <label className="text-[10px] font-black uppercase text-muted tracking-widest">Comportamento em Grupos</label>
                    </div>
                    <div
                      className={cn("w-10 h-5 rounded-full transition-all relative cursor-pointer", editingAgent.groupEnabled ? "bg-primary" : "bg-zinc-300 dark:bg-zinc-700")}
                      onClick={() => setEditingAgent({...editingAgent, groupEnabled: !editingAgent.groupEnabled})}
                    >
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", editingAgent.groupEnabled ? "left-5" : "left-0.5")} />
                    </div>
                  </div>
                  {editingAgent.groupEnabled && (
                    <div className="space-y-3 mt-2">
                      <div>
                        <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Ativar quando:</label>
                        <select
                          value={editingAgent.groupActivation || 'mention'}
                          onChange={e => setEditingAgent({...editingAgent, groupActivation: e.target.value})}
                          className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none"
                        >
                          <option value="mention">Mencionado (@nome)</option>
                          <option value="always">Sempre (toda mensagem)</option>
                          <option value="keyword">Palavra-chave</option>
                          <option value="reply">Reply a mensagem do bot</option>
                        </select>
                      </div>
                      {editingAgent.groupActivation === 'mention' && (
                        <div>
                          <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Padroes de menção (além do @nome):</label>
                          <input
                            className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none"
                            value={(editingAgent.groupMentionPatterns || []).join(', ')}
                            onChange={e => setEditingAgent({...editingAgent, groupMentionPatterns: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)})}
                            placeholder="bot, ia, ajuda"
                          />
                        </div>
                      )}
                      {editingAgent.groupActivation === 'keyword' && (
                        <div>
                          <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Palavras-chave:</label>
                          <input
                            className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none"
                            value={(editingAgent.groupKeywords || []).join(', ')}
                            onChange={e => setEditingAgent({...editingAgent, groupKeywords: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)})}
                            placeholder="ajuda, suporte, bot"
                          />
                        </div>
                      )}
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Cooldown (seg)</label>
                          <input type="number" min={0} max={300}
                            className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none"
                            value={editingAgent.groupCooldown ?? 5}
                            onChange={e => setEditingAgent({...editingAgent, groupCooldown: parseInt(e.target.value) || 5})}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Contexto (msgs)</label>
                          <input type="number" min={1} max={50}
                            className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none"
                            value={editingAgent.groupHistoryLimit ?? 10}
                            onChange={e => setEditingAgent({...editingAgent, groupHistoryLimit: parseInt(e.target.value) || 10})}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Fase 29: Controle de Acesso */}
                <div className="space-y-3 border border-border-strong p-5 bg-background/50">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <label className="text-[10px] font-black uppercase text-muted tracking-widest">Controle de Acesso</label>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Modo de acesso:</label>
                    <select
                      value={editingAgent.accessMode || 'open'}
                      onChange={e => setEditingAgent({...editingAgent, accessMode: e.target.value})}
                      className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none"
                    >
                      <option value="open">Aberto (qualquer pessoa)</option>
                      <option value="allowlist">Allowlist (só números autorizados)</option>
                      <option value="pairing">Aprovação (pede permissão ao dono)</option>
                      <option value="disabled">Desativado (não responde ninguém)</option>
                    </select>
                  </div>
                  {editingAgent.accessMode === 'allowlist' && (
                    <div>
                      <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Números permitidos (um por linha):</label>
                      <textarea
                        rows={3}
                        className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none resize-none"
                        value={(editingAgent.accessAllowlist || []).join('\n')}
                        onChange={e => setEditingAgent({...editingAgent, accessAllowlist: e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean)})}
                        placeholder="5511999999999&#10;5521888888888"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[9px] font-bold uppercase text-muted tracking-widest mb-1 block">Números bloqueados:</label>
                    <textarea
                      rows={2}
                      className="w-full bg-surface border border-border-strong p-2 text-xs font-mono outline-none resize-none"
                      value={(editingAgent.accessBlocklist || []).join('\n')}
                      onChange={e => setEditingAgent({...editingAgent, accessBlocklist: e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean)})}
                      placeholder="5511666666666"
                    />
                  </div>
                </div>

                <div className="pt-8 border-t border-border-strong flex gap-4">
                  <button
                    type="button"
                    onClick={() => setEditingAgent(null)}
                    className="flex-1 py-4 border-2 border-border-strong text-[10px] font-black uppercase hover:bg-foreground/5 transition-all tracking-widest"
                  >
                    ABORT SESSION
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-4 bg-primary text-white text-[10px] font-black uppercase hover:bg-foreground transition-all flex items-center justify-center gap-4 tracking-[0.2em] shadow-[0_10px_20px_rgba(var(--primary),0.2)]"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    SYNC INTELLIGENCE
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
