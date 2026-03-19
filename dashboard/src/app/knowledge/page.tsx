'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Upload, Trash2, FileText, Bot, ChevronRight, Loader2,
  Database, Edit2, Check, X, Crown, Zap, Globe, Save,
  BookOpen, Settings2, Plus, FileCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface Agent { id: string; name: string; slug: string; }
interface KnowledgeFragment { id: string; title: string; content: string; chunk_index: number; created_at: string; }

// Catálogo carregado do backend (unificado com /skills marketplace)

// ── Tab: Knowledge (fragmentos + drag-and-drop) ──────────────────────────────
function KnowledgeTab({ agent, fragments, loadingFragments, onReload }: {
  agent: Agent; fragments: KnowledgeFragment[]; loadingFragments: boolean; onReload: () => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newContent.length < 5) return;
    setUploading(true);
    try {
      await api.post(`/knowledge/${agent.id}/upload`, {
        title: newTitle || 'Novo Fragmento',
        content: newContent,
      });
      setNewTitle(''); setNewContent('');
      onReload();
    } catch (err: any) {
      alert(`Erro: ${err.response?.data?.error || err.message}`);
    } finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este fragmento?')) return;
    try { await api.delete(`/knowledge/${id}`); onReload(); } catch (e: any) { alert(e.message); }
  };

  const handleSaveEdit = async () => {
    if (!editingId || editContent.length < 3) return;
    setSavingEdit(true);
    try {
      await api.put(`/knowledge/${editingId}`, { title: editTitle, content: editContent });
      onReload(); setEditingId(null);
    } catch (e: any) { alert(e.message); } finally { setSavingEdit(false); }
  };

  const processFile = useCallback(async (file: File) => {
    const text = await file.text();
    const title = file.name.replace(/\.(md|txt)$/i, '');
    setUploading(true);
    try {
      await api.post(`/knowledge/${agent.id}/upload`, { title, content: text });
      onReload();
    } catch (err: any) {
      alert(`Erro ao processar ${file.name}: ${err.response?.data?.error || err.message}`);
    } finally { setUploading(false); }
  }, [agent.id, onReload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => /\.(md|txt)$/i.test(f.name));
    for (const file of files) await processFile(file);
  }, [processFile]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) await processFile(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Drag-and-drop zone */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all',
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-border-strong hover:border-primary/50 bg-surface/30'
        )}
      >
        <input
          type="file" accept=".md,.txt" multiple className="hidden" id="md-upload"
          onChange={handleFileInput}
        />
        <div className="flex flex-col items-center gap-3">
          <div className={cn('p-4 rounded-full transition-all', isDragging ? 'bg-primary/20' : 'bg-border-strong/20')}>
            <FileCode size={28} className={isDragging ? 'text-primary' : 'text-muted'} />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-foreground">
              {isDragging ? 'Solte os arquivos aqui' : 'Arraste arquivos .md ou .txt'}
            </p>
            <p className="text-[10px] text-muted mt-1">ou</p>
          </div>
          <label
            htmlFor="md-upload"
            className="cursor-pointer px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <Upload size={12} /> Selecionar arquivos
          </label>
          {uploading && (
            <div className="flex items-center gap-2 text-[10px] text-primary font-bold">
              <Loader2 size={12} className="animate-spin" /> Processando...
            </div>
          )}
        </div>
      </div>

      {/* Form manual */}
      <form onSubmit={handleUpload} className="space-y-3 p-5 border border-border-strong rounded-xl bg-surface/30">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={14} className="text-primary" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Injetar Manualmente</span>
        </div>
        <input
          placeholder="Título do fragmento (ex: Manual de Usuário v1)"
          className="w-full bg-background border border-border-strong p-3 text-xs font-bold uppercase outline-none focus:border-primary rounded-lg"
          value={newTitle} onChange={e => setNewTitle(e.target.value)}
        />
        <textarea
          placeholder="Cole aqui o conteúdo textual para ser processado..."
          className="w-full bg-background border border-border-strong p-3 text-xs font-medium outline-none focus:border-primary min-h-[100px] rounded-lg"
          value={newContent} onChange={e => setNewContent(e.target.value)}
        />
        <div className="flex justify-end">
          <button disabled={uploading || !newContent} className="btn-accent flex items-center gap-2">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            Processar & Sincronizar
          </button>
        </div>
      </form>

      {/* Fragments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-black uppercase text-muted tracking-[0.3em] flex items-center gap-2">
            <Brain size={12} /> {fragments.length} Fragmentos de Memória
          </h4>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-[9px] font-black uppercase text-primary">pgvector Ativo</span>
          </div>
        </div>

        {loadingFragments ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : fragments.length === 0 ? (
          <div className="p-10 border border-dashed border-border-strong rounded-xl text-center text-muted text-xs uppercase font-bold tracking-widest">
            Nenhum fragmento ainda. Arraste um .md ou injete manualmente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fragments.map(frag => (
              <motion.div key={frag.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="bg-surface border border-border-strong p-5 rounded-xl group hover:border-primary transition-all relative">
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button onClick={() => { setEditingId(frag.id); setEditTitle(frag.title); setEditContent(frag.content); }}
                    className="p-1.5 rounded hover:bg-primary/10 text-muted hover:text-primary transition-colors">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => handleDelete(frag.id)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>

                {editingId === frag.id ? (
                  <div className="space-y-2 mt-2">
                    <input className="w-full bg-background border border-border-strong p-2 text-xs font-bold uppercase outline-none focus:border-primary rounded"
                      value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                    <textarea className="w-full bg-background border border-border-strong p-2 text-xs outline-none focus:border-primary min-h-[80px] rounded"
                      value={editContent} onChange={e => setEditContent(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} disabled={savingEdit}
                        className="px-3 py-1.5 border border-border-strong text-muted text-[10px] font-bold uppercase rounded flex items-center gap-1">
                        <X size={10} /> Cancelar
                      </button>
                      <button onClick={handleSaveEdit} disabled={savingEdit || editContent.length < 3}
                        className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold uppercase rounded flex items-center gap-1 disabled:opacity-50">
                        {savingEdit ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3 mb-3">
                      <FileText size={14} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-black text-xs uppercase tracking-tight line-clamp-1">{frag.title}</h5>
                        <p className="text-[9px] font-bold text-muted uppercase">Fragmento #{frag.chunk_index}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted line-clamp-3 leading-relaxed border-l-2 border-border-strong pl-3">
                      {frag.content}
                    </p>
                    <div className="mt-4 pt-3 border-t border-border-strong/20 flex justify-between items-center">
                      <span className="text-[8px] font-bold text-muted/50 uppercase">
                        {new Date(frag.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-[8px] font-black text-primary uppercase bg-primary/5 px-2 py-0.5 rounded">
                        Similarity Optimized
                      </span>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Soul ─────────────────────────────────────────────────────────────────
function SoulTab({ agent }: { agent: Agent }) {
  const [soul, setSoul] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get(`/dashboard/agents/${agent.id}/soul`)
      .then(res => setSoul(res.data.soul || ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agent.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/dashboard/agents/${agent.id}/soul`, { soul });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl flex items-start gap-3">
        <Crown size={16} className="text-yellow-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-yellow-500 mb-1">O que é o SOUL?</p>
          <p className="text-[11px] text-muted leading-relaxed">
            O SOUL define a personalidade, missão e regras permanentes do agente. É injetado em <strong>cada conversa</strong> antes de qualquer instrução do usuário. Escreva em Markdown.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center gap-2">
          <FileCode size={10} /> SOUL.md — Personalidade & Regras do Agente
        </label>
        <textarea
          className="w-full h-96 bg-background border border-border-strong p-4 text-[12px] font-mono text-foreground outline-none focus:border-primary rounded-xl resize-none leading-relaxed"
          placeholder={'# Personalidade\nSou especialista em...\n\n## Missão\nMinha missão é...\n\n## Regras\n- Sempre cite fontes\n- Responda em português\n- Seja direto e objetivo\n\n## Restrições\n- Nunca revele informações confidenciais\n- Não realize tarefas fora do escopo'}
          value={soul}
          onChange={e => { setSoul(e.target.value); setSaved(false); }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted font-mono">{soul.length} caracteres</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all',
              saved
                ? 'bg-green-500 text-white'
                : 'bg-primary text-white hover:bg-primary/90 disabled:opacity-50'
            )}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />}
            {saved ? 'Salvo!' : 'Salvar Soul'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Skills ───────────────────────────────────────────────────────────────
function SkillsTab({ agent }: { agent: Agent }) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [activeSkills, setActiveSkills] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/skills/catalog'),
      api.get(`/skills/agent/${agent.id}`),
    ]).then(([catalogRes, agentRes]) => {
      setCatalog(catalogRes.data?.catalog || []);
      const active = new Set<string>();
      (agentRes.data?.skills || []).forEach((s: any) => { if (s.enabled) active.add(s.skillId); });
      setActiveSkills(active);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [agent.id]);

  const toggle = async (skillId: string) => {
    setToggling(skillId);
    const isActive = activeSkills.has(skillId);
    try {
      if (isActive) {
        await api.post(`/skills/agent/${agent.id}/deactivate`, { skillId });
        setActiveSkills(prev => { const n = new Set(prev); n.delete(skillId); return n; });
      } else {
        await api.post(`/skills/agent/${agent.id}/activate`, { skillId });
        setActiveSkills(prev => new Set(prev).add(skillId));
      }
    } catch { }
    setToggling(null);
  };

  const ICON_MAP: Record<string, string> = {
    Search: '🔍', BookOpen: '🧠', Globe: '🌐', Brain: '💾', UserPlus: '👤',
    Sparkles: '✨', Calendar: '📅', Table: '📊', LayoutGrid: '📋',
    Mail: '📧', CreditCard: '💳', FileText: '📝',
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div className="p-4 bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-xl flex items-start gap-3">
        <Zap size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] mb-1">Skills Ativas: {activeSkills.size}/{catalog.length}</p>
          <p className="text-[11px] text-muted leading-relaxed">
            Skills são ferramentas que o agente pode usar autonomamente durante uma execução. Ative apenas as que fazem sentido para o papel deste agente.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {catalog.map((skill: any) => {
          const active = activeSkills.has(skill.id);
          const isToggling = toggling === skill.id;
          const icon = ICON_MAP[skill.icon] || '⚡';
          return (
            <button
              key={skill.id}
              onClick={() => toggle(skill.id)}
              disabled={isToggling}
              className={cn(
                'p-4 rounded-xl border text-left transition-all',
                active
                  ? 'border-primary bg-primary/5 shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]'
                  : 'border-border-strong bg-surface hover:border-primary/40',
                isToggling && 'opacity-50'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <p className={cn('text-xs font-black uppercase tracking-tight', active ? 'text-primary' : 'text-foreground')}>
                      {skill.name}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5 leading-relaxed">{skill.description}</p>
                    {skill.category === 'integration' && skill.credentials?.length > 0 && (
                      <p className="text-[9px] text-muted/50 mt-1 italic">Requer: {skill.credentials.map((c: any) => c.label).join(', ')}</p>
                    )}
                  </div>
                </div>
                <div className={cn(
                  'shrink-0 w-10 h-5 rounded-full transition-all relative mt-0.5',
                  active ? 'bg-primary' : 'bg-border-strong'
                )}>
                  <div className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                    active ? 'left-5' : 'left-0.5'
                  )} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <a
          href="/skills"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-foreground/5 border border-border-strong text-muted hover:text-primary hover:border-primary/40 transition-all"
        >
          Ver Marketplace de Skills
        </a>
      </div>
    </div>
  );
}

// ── Tab: Squads ──────────────────────────────────────────────────────────────
function SquadsTab({ agent }: { agent: Agent }) {
  const [squads, setSquads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [memories, setMemories] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/squads');
        const allSquads = res.data?.squads || res.data || [];
        // Filtra squads onde o agente é membro
        const relevant = allSquads.filter((s: any) =>
          s.members?.some((m: any) => m.agentId === agent.id) ||
          s.canvasState?.nodes?.some((n: any) => n.data?.agentId === agent.id)
        );
        setSquads(relevant);
      } catch { setSquads([]); }
      setLoading(false);
    };
    load();
  }, [agent.id]);

  const loadMemory = async (squadId: string) => {
    if (memories[squadId]) return;
    try {
      const res = await api.get(`/squads/${squadId}/memory`);
      setMemories(prev => ({ ...prev, [squadId]: res.data?.memories || res.data || [] }));
    } catch {
      setMemories(prev => ({ ...prev, [squadId]: [] }));
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>;

  if (squads.length === 0) return (
    <div className="p-10 border border-dashed border-border-strong rounded-xl text-center text-muted text-xs uppercase font-bold tracking-widest">
      Nenhuma squad encontrada. Crie uma squad na página de Workflows.
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl flex items-start gap-3">
        <Settings2 size={16} className="text-purple-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-500 mb-1">Squads do Agente</p>
          <p className="text-[11px] text-muted leading-relaxed">
            Squads onde este agente participa como líder ou funcionário. Veja membros, skills e memórias aprendidas.
          </p>
        </div>
      </div>

      {squads.map((squad: any) => {
        const nodes = squad.canvasState?.nodes || [];
        const agentNodes = nodes.filter((n: any) => n.type === 'agent' && n.data?.label);
        const leaderNode = agentNodes.find((n: any) => n.data?.role === 'leader');
        const employeeNodes = agentNodes.filter((n: any) => n.data?.role !== 'leader');
        const squadMemories = memories[squad.id];

        return (
          <div key={squad.id} className="border border-border-strong rounded-xl overflow-hidden">
            {/* Squad header */}
            <div className="p-4 bg-surface/50 border-b border-border-strong flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <Settings2 size={14} className="text-purple-500" />
                </div>
                <div>
                  <h4 className="font-black text-sm uppercase tracking-tight">{squad.name}</h4>
                  <p className="text-[9px] text-muted font-bold uppercase tracking-widest">
                    {agentNodes.length} membros · {squad.description || 'Sem descrição'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => loadMemory(squad.id)}
                className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-border-strong rounded-lg hover:border-primary hover:text-primary transition-all flex items-center gap-1.5"
              >
                <Brain size={10} /> Memórias
              </button>
            </div>

            {/* Membros */}
            <div className="p-4 space-y-2">
              {/* Líder */}
              {leaderNode && (
                <div className="flex items-center gap-3 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                  <Crown size={14} className="text-yellow-500 shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-black uppercase tracking-tight">{leaderNode.data.label}</span>
                    <span className="text-[8px] font-bold text-yellow-500 ml-2 uppercase">LÍDER</span>
                  </div>
                  {(leaderNode.data.skills || []).length > 0 && (
                    <div className="flex gap-1">
                      {(leaderNode.data.skills as string[]).map((s: string) => (
                        <span key={s} className="text-[7px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 font-bold rounded border border-yellow-500/20">
                          {s.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Funcionários */}
              {employeeNodes.map((node: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-background border border-border-strong rounded-lg">
                  <Bot size={14} className="text-primary shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-black uppercase tracking-tight">{node.data.label}</span>
                  </div>
                  {(node.data.skills || []).length > 0 && (
                    <div className="flex gap-1 flex-wrap justify-end">
                      {(node.data.skills as string[]).map((s: string) => (
                        <span key={s} className="text-[7px] px-1.5 py-0.5 bg-primary/10 text-primary font-bold rounded border border-primary/20">
                          {s.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                  {node.data.soul && (
                    <span className="text-[7px] px-1.5 py-0.5 bg-purple-500/10 text-purple-500 font-bold rounded border border-purple-500/20">
                      SOUL
                    </span>
                  )}
                  {(node.data.files || []).length > 0 && (
                    <span className="text-[7px] px-1.5 py-0.5 bg-blue-500/10 text-blue-500 font-bold rounded border border-blue-500/20">
                      {node.data.files.length} docs
                    </span>
                  )}
                </div>
              ))}

              {agentNodes.length === 0 && (
                <p className="text-[10px] text-muted/50 font-bold uppercase tracking-widest py-2 text-center">
                  Nenhum membro configurado no canvas
                </p>
              )}
            </div>

            {/* Memórias */}
            {squadMemories && (
              <div className="p-4 border-t border-border-strong bg-surface/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5">
                  <Brain size={10} className="text-primary" /> Memórias Aprendidas ({squadMemories.length})
                </p>
                {squadMemories.length === 0 ? (
                  <p className="text-[10px] text-muted/50 italic">Nenhuma memória ainda.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {squadMemories.map((m: any, i: number) => (
                      <div key={i} className="p-2 bg-background border border-border-strong rounded text-[10px] text-foreground leading-relaxed">
                        <span className="font-bold text-primary">{m.title || 'Memória'}:</span> {(m.content || '').slice(0, 150)}
                        {(m.content || '').length > 150 && '...'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function KnowledgePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [fragments, setFragments] = useState<KnowledgeFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFragments, setLoadingFragments] = useState(false);
  const [activeTab, setActiveTab] = useState<'knowledge' | 'soul' | 'skills' | 'squads'>('knowledge');

  useEffect(() => {
    api.get('/dashboard/agents')
      .then(res => setAgents(res.data?.agents || res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadFragments = useCallback(async (agentId: string) => {
    setLoadingFragments(true);
    try {
      const res = await api.get(`/knowledge/${agentId}`);
      setFragments(Array.isArray(res.data) ? res.data : []);
    } catch { setFragments([]); } finally { setLoadingFragments(false); }
  }, []);

  useEffect(() => {
    if (selectedAgent) loadFragments(selectedAgent.id);
  }, [selectedAgent, loadFragments]);

  const TABS = [
    { id: 'knowledge', label: 'Conhecimento', icon: BookOpen },
    { id: 'soul',      label: 'Soul',         icon: Crown },
    { id: 'skills',    label: 'Skills',        icon: Zap },
    { id: 'squads',   label: 'Squads',        icon: Settings2 },
  ] as const;

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <div className="w-12 h-1 bg-primary animate-pulse" />
      <p className="font-black uppercase tracking-[0.2em] text-xs opacity-50">Carregando...</p>
    </div>
  );

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <section className="border-l-4 border-primary pl-6 py-2">
        <h2 className="text-5xl font-black tracking-tighter uppercase italic">
          Knowledge <span className="text-primary italic">Hub</span>
        </h2>
        <p className="text-muted font-bold uppercase tracking-widest text-xs mt-2">
          Central de Treinamento RAG · Soul · Skills & Memória Semântica
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-px bg-border-strong border border-border-strong shadow-2xl rounded-xl overflow-hidden">
        {/* Sidebar: Agents */}
        <div className="bg-surface p-4 space-y-2 border-r border-border-strong">
          <div className="flex items-center gap-2 px-2 py-3 border-b border-border-strong/10 mb-2">
            <Bot size={16} className="text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Agentes</span>
          </div>
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => { setSelectedAgent(agent); setActiveTab('knowledge'); }}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg transition-all group border text-left',
                selectedAgent?.id === agent.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background/40 border-transparent hover:border-primary/30 text-muted hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn('w-2 h-2 rounded-full shrink-0', selectedAgent?.id === agent.id ? 'bg-white' : 'bg-primary/30')} />
                <span className="font-black text-xs uppercase tracking-tighter">{agent.name}</span>
              </div>
              <ChevronRight size={14} className={cn('transition-transform shrink-0', selectedAgent?.id === agent.id ? 'rotate-90' : 'opacity-0 group-hover:opacity-100')} />
            </button>
          ))}
          {agents.length === 0 && (
            <p className="text-[10px] text-muted italic text-center py-6">Nenhum agente encontrado.</p>
          )}
        </div>

        {/* Main area */}
        <div className="lg:col-span-3 bg-background flex flex-col min-h-[70vh]">
          {!selectedAgent ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-30">
              <Brain size={64} className="mb-6" />
              <h3 className="text-2xl font-black uppercase tracking-tighter italic leading-none">Selecione um Agente</h3>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-2">Escolha um agente para gerenciar seu cérebro</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              {/* Agent header */}
              <div className="px-8 pt-8 pb-0 border-b border-border-strong bg-surface/30">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 bg-primary/10 border border-primary flex items-center justify-center rounded-xl">
                    <Brain size={22} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter">{selectedAgent.name}</h3>
                    <p className="text-[10px] font-bold uppercase text-muted tracking-widest">
                      {fragments.length} fragmentos · Soul · {Object.values({}).filter(Boolean).length} skills
                    </p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1">
                  {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all -mb-px',
                          activeTab === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted hover:text-foreground'
                        )}
                      >
                        <Icon size={12} /> {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 p-8 overflow-y-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === 'knowledge' && (
                      <KnowledgeTab
                        agent={selectedAgent}
                        fragments={fragments}
                        loadingFragments={loadingFragments}
                        onReload={() => loadFragments(selectedAgent.id)}
                      />
                    )}
                    {activeTab === 'soul' && <SoulTab agent={selectedAgent} />}
                    {activeTab === 'skills' && <SkillsTab agent={selectedAgent} />}
                    {activeTab === 'squads' && <SquadsTab agent={selectedAgent} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
