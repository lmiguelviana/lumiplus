'use client';

import { useState, useEffect } from 'react';
import {
  Search, BookOpen, Globe, Brain, UserPlus, Sparkles, Calendar, Table,
  LayoutGrid, Mail, CreditCard, FileText, Loader2, Check, X, Zap, Trash2, Bot,
} from 'lucide-react';
import api from '@/lib/api';

const ICON_MAP: Record<string, any> = {
  Search, BookOpen, Globe, Brain, UserPlus, Sparkles, Calendar, Table,
  LayoutGrid, Mail, CreditCard, FileText, Zap,
};

const TABS = [
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'custom', label: 'Personalizadas' },
];

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Todas',
  native: 'Nativas',
  integration: 'Integrações',
};

interface SkillItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  isDefault: boolean;
  credentials: Array<{ key: string; label: string; placeholder: string; required: boolean }>;
  activeAgents: string[];
  comingSoon?: boolean;
}

interface CustomSkill {
  skillId: string;
  apiName: string;
  credentialKey: string;
  agents: Array<{ id: string; name: string; slug: string }>;
  createdAt: string;
}

export default function SkillsPage() {
  const [catalog, setCatalog] = useState<SkillItem[]>([]);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('marketplace');
  const [filter, setFilter] = useState('all');
  const [activateModal, setActivateModal] = useState<SkillItem | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [skillsRes, agentsRes, customRes] = await Promise.all([
        api.get('/skills/catalog'),
        api.get('/dashboard/agents'),
        api.get('/skills/custom'),
      ]);
      setCatalog(skillsRes.data?.catalog || []);
      const agentData = agentsRes.data;
      setAgents(Array.isArray(agentData) ? agentData : (agentData?.agents || agentData?.data || []));
      setCustomSkills(customRes.data?.customSkills || []);
    } catch (err) {
      console.error('Erro ao carregar skills/agentes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = filter === 'all' ? catalog : catalog.filter(s => s.category === filter);

  const openActivate = (skill: SkillItem) => {
    setActivateModal(skill);
    setSelectedAgents(skill.activeAgents || []);
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
    );
  };

  const handleSave = async () => {
    if (!activateModal) return;
    setSaving(true);
    try {
      for (const agentId of selectedAgents) {
        if (!activateModal.activeAgents.includes(agentId)) {
          await api.post(`/skills/agent/${agentId}/activate`, { skillId: activateModal.id });
        }
      }
      for (const agentId of activateModal.activeAgents) {
        if (!selectedAgents.includes(agentId)) {
          await api.post(`/skills/agent/${agentId}/deactivate`, { skillId: activateModal.id });
        }
      }
      const res = await api.get('/skills/catalog');
      setCatalog(res.data.catalog || []);
      setActivateModal(null);
    } catch {
      alert('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCustom = async (skillId: string, agentId: string) => {
    const key = `${skillId}:${agentId}`;
    setRemoving(key);
    try {
      const rawId = skillId.replace('custom:', '');
      await api.delete(`/skills/custom/${rawId}/agent/${agentId}`);
      await loadData();
    } catch {
      alert('Erro ao remover.');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-3" />
        <span className="font-bold text-xs uppercase tracking-widest text-foreground/50">Carregando skills...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 pt-10 pb-20 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter italic">
              Skills <span className="text-primary italic">Marketplace</span>
            </h1>
          </div>
        </div>
        <p className="text-sm text-foreground/50 mt-2 max-w-2xl">
          Adicione capacidades aos seus agentes. Skills nativas funcionam sem configuração. Integrações precisam de credenciais.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-strong">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all -mb-px ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {t.label}
            {t.key === 'custom' && customSkills.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[8px] bg-primary/20 text-primary rounded-full">
                {customSkills.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── ABA MARKETPLACE ── */}
      {tab === 'marketplace' && (
        <>
          {/* Filtros */}
          <div className="flex gap-2">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${
                  filter === key
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface border-border-strong text-muted hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(skill => {
              const Icon = ICON_MAP[skill.icon] || Sparkles;
              const isActive = skill.activeAgents.length > 0;
              return (
                <div
                  key={skill.id}
                  className={`industrial-card p-5 cursor-pointer hover:border-primary/50 transition-all group ${
                    isActive ? 'border-green-500/30' : ''
                  }`}
                  onClick={() => openActivate(skill)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded border ${
                        isActive
                          ? 'bg-green-500/10 border-green-500/30 text-green-500'
                          : 'bg-foreground/5 border-border-strong text-muted'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm uppercase tracking-wide">{skill.name}</h3>
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${
                          skill.category === 'native' ? 'text-green-500' : 'text-blue-400'
                        }`}>
                          {skill.category === 'native' ? 'Nativa' : 'Integração'}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-green-600/10 text-green-500 border border-green-500/20">
                        {skill.activeAgents.length} agente{skill.activeAgents.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/50 leading-relaxed">{skill.description}</p>
                  {skill.comingSoon && (
                    <div className="mt-2 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-[9px] font-bold uppercase tracking-widest inline-block">
                      Em breve
                    </div>
                  )}
                  {!skill.comingSoon && skill.credentials.length > 0 && (
                    <div className="mt-2 text-[9px] text-muted/50 italic">
                      Requer: {skill.credentials.map(c => c.label).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── ABA PERSONALIZADAS ── */}
      {tab === 'custom' && (
        <div className="space-y-4">
          <p className="text-xs text-foreground/50">
            APIs instaladas automaticamente pelos agentes via Auto-Configuração.
            Cada card mostra qual agente configurou a integração.
          </p>

          {customSkills.length === 0 ? (
            <div className="industrial-card p-10 text-center">
              <Zap className="w-8 h-8 text-muted/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted/50 uppercase tracking-widest">Nenhuma skill personalizada ainda</p>
              <p className="text-xs text-muted/40 mt-1 max-w-sm mx-auto">
                Ative a skill <strong>Auto-Configuração</strong> em um agente e envie a documentação de uma API para ele instalar automaticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customSkills.map(cs => (
                <div key={cs.skillId} className="industrial-card p-5 border-purple-500/20">
                  {/* Header do card */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded border bg-purple-500/10 border-purple-500/30 text-purple-400">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm uppercase tracking-wide">{cs.apiName}</h3>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-purple-400">
                          Auto-Configurada
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {cs.agents.length} agente{cs.agents.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <p className="text-[10px] text-muted/60 font-mono mb-3">
                    Credencial: <span className="text-foreground/70">{cs.credentialKey}</span>
                  </p>

                  {/* Lista de agentes */}
                  <div className="space-y-1.5 border-t border-border-strong pt-3">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted block mb-1.5">
                      Agentes com acesso
                    </span>
                    {cs.agents.map(agent => (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between px-2.5 py-1.5 bg-surface border border-border-strong/50"
                      >
                        <div className="flex items-center gap-2">
                          <Bot className="w-3 h-3 text-purple-400" />
                          <span className="text-xs font-bold">{agent.name}</span>
                          <span className="text-[9px] text-muted">@{agent.slug}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveCustom(cs.skillId, agent.id)}
                          disabled={removing === `${cs.skillId}:${agent.id}`}
                          className="text-muted hover:text-red-400 transition-colors disabled:opacity-40"
                          title="Remover acesso"
                        >
                          {removing === `${cs.skillId}:${agent.id}`
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Trash2 className="w-3 h-3" />
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de ativação */}
      {activateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setActivateModal(null)}>
          <div className="bg-background border border-border-strong max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => { const Icon = ICON_MAP[activateModal.icon] || Sparkles; return <Icon className="w-5 h-5 text-primary" />; })()}
                <h2 className="font-black text-sm uppercase tracking-widest">{activateModal.name}</h2>
              </div>
              <button onClick={() => setActivateModal(null)} className="text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-foreground/50">{activateModal.description}</p>

            {/* Credenciais */}
            {activateModal.credentials.length > 0 && (
              <div className="space-y-2 border-t border-border-strong pt-3">
                <span className="font-black text-[10px] uppercase tracking-widest text-muted">Credenciais</span>
                {activateModal.credentials.map(cred => (
                  <div key={cred.key}>
                    <label className="text-[10px] font-bold text-foreground/70 mb-1 block">{cred.label}</label>
                    <input
                      placeholder={cred.placeholder}
                      className="w-full h-9 px-3 text-xs font-mono bg-surface border border-border-strong focus:border-primary focus:outline-none"
                      style={{ borderRadius: 0 }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Agentes */}
            <div className="border-t border-border-strong pt-3">
              <span className="font-black text-[10px] uppercase tracking-widest text-muted mb-2 block">Ativar para quais agentes?</span>
              {agents.length === 0 && (
                <p className="text-xs text-muted/50 italic py-2">Nenhum agente encontrado. Crie um agente primeiro.</p>
              )}
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {agents.map((agent: any) => (
                  <label
                    key={agent.id}
                    className="flex items-center gap-2 p-2 border border-border-strong/50 hover:border-primary/30 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes(agent.id)}
                      onChange={() => toggleAgent(agent.id)}
                      className="accent-primary"
                    />
                    <span className="text-xs font-bold">{agent.name}</span>
                    <span className="text-[9px] text-muted ml-auto">@{agent.slug}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setActivateModal(null)}
                className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest border border-border-strong text-muted hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
