'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  Node,
  Edge,
  Connection,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  useStore,
  NodeResizer,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from '@xyflow/react';
import {
  Bot,
  Settings2,
  Trash2,
  Users,
  Play,
  Database,
  MousePointer2,
  Plus,
  Rocket,
  ArrowRight,
  Send,
  MessageSquare,
  Server,
  Maximize2,
  Minimize2,
  X,
  Crown,
  Zap,
  Globe,
  Brain,
  Save,
  ChevronRight,
  Loader2,
  Sparkles,
  GitBranch,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import '@xyflow/react/dist/style.css';

// --- CUSTOM NODES ---

const ServerNode = ({ id, data }: any) => {
  const { setNodes } = useReactFlow();
  return (
    <div className="industrial-card p-4 min-w-[200px] border-blue-500/50 bg-blue-500/5 transition-colors group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-blue-500/20 text-blue-500 border border-blue-500/30">
            <Server size={16} />
          </div>
          <div className="font-mono text-xs font-bold tracking-widest text-blue-500">HOST SERVER</div>
        </div>
        <Trash2 
          size={14} 
          className="text-muted/50 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" 
          onClick={() => setNodes((nds) => nds.filter((n) => n.id !== id))}
        />
      </div>
      <div className="text-sm font-bold text-foreground">{data.label}</div>
      <div className="text-[10px] text-muted mt-1 font-mono uppercase tracking-tighter">
        {data.status || 'READY'}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-blue-500 !border-2 !border-background hover:!scale-125 transition-transform" />
    </div>
  );
};

const WorkflowCanvasContext = React.createContext<{
  onRun?: () => void;
  squadId?: string;
  openAgentPanel?: (nodeId: string) => void;
}>({});

const ButtonNode = ({ id, data }: any) => {
  const { setNodes } = useReactFlow();
  const { onRun } = useContext(WorkflowCanvasContext);
  const [loading, setLoading] = useState(false);
  const handleRun = useCallback(async () => {
    if (!onRun) return;
    setLoading(true);
    try {
      await onRun();
    } finally {
      setLoading(false);
    }
  }, [onRun]);
  return (
    <div className="industrial-card p-4 min-w-[180px] border-orange-500/50 bg-orange-500/5 hover:shadow-[0_0_15px_rgba(249,115,22,0.1)] transition-all group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-orange-500/20 text-orange-500 border border-orange-500/30">
            <MousePointer2 size={16} />
          </div>
          <div className="font-mono text-xs font-bold tracking-widest text-orange-500">MANUAL TRIGGER</div>
        </div>
        <Trash2 
          size={14} 
          className="text-muted/50 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" 
          onClick={() => setNodes((nds) => nds.filter((n) => n.id !== id))}
        />
      </div>
      <div className="text-sm font-bold text-foreground">{data.label}</div>
      <button 
        type="button"
        onClick={handleRun}
        disabled={!onRun || loading}
        className="mt-3 w-full py-1.5 bg-orange-500 text-white font-bold text-[10px] uppercase tracking-widest rounded hover:bg-orange-600 transition-colors disabled:opacity-50"
      >
        {loading ? '...' : 'DISPARAR AGORA'}
      </button>
      <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-orange-500 !border-2 !border-background hover:!scale-125 transition-transform" />
    </div>
  );
};

const AgentNode = ({ id, data }: any) => {
  const isRunning = data.status === 'running';
  const isCompleted = data.status === 'completed';
  const isFailed = data.status === 'failed';
  const { setNodes, getNode } = useReactFlow();
  const { openAgentPanel } = useContext(WorkflowCanvasContext);
  const [agents, setAgents] = useState<any[]>([]);
  const collapsed = !!data.collapsed;
  const setCollapsed = (val: boolean) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, collapsed: val } } : n));

  // Deve ficar ANTES de qualquer return condicional (Rules of Hooks)
  const thisNode = getNode(id);
  const isInsideSquad = data.role === 'employee' || data.role === 'leader' || !!thisNode?.parentId;
  const parentSquadNode = thisNode?.parentId ? getNode(thisNode.parentId) : null;
  const isLeader = isInsideSquad && !!data.agentId && data.agentId === parentSquadNode?.data?.leaderId;

  React.useEffect(() => {
    api.get('/dashboard/agents')
      .then((res) => setAgents(res.data?.agents || res.data || []))
      .catch(() => {});
  }, []);

  const updateData = (updates: any) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...updates } } : n));

  const handleAgentSelect = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    updateData({ agentId, label: agent?.name || data.label });
  };

  const statusColor = isRunning ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] bg-[var(--accent)]/10'
    : isCompleted ? 'border-green-500/50 bg-green-500/5'
    : isFailed ? 'border-red-500/50 bg-red-500/5'
    : isLeader ? 'border-yellow-500/60 bg-yellow-500/5 shadow-[0_0_12px_rgba(234,179,8,0.15)]'
    : 'border-[var(--accent)]/30 bg-[var(--accent)]/5';

  /* —— MODO COMPACTO —— */
  if (collapsed) {
    return (
      <div className={`industrial-card px-3 py-2 flex items-center gap-2.5 min-w-[160px] transition-all duration-200 group cursor-default ${statusColor}`}>
        {isLeader
          ? <Crown size={13} className="text-yellow-500 shrink-0" />
          : <Bot size={13} className={isRunning ? 'text-[var(--accent)] animate-bounce' : 'text-[var(--accent)]/60'} />
        }
        <span className="text-[11px] font-black text-foreground truncate flex-1">{data.label || 'Funcionário'}</span>
        {isLeader && <span className="text-[7px] px-1 py-0.5 bg-yellow-500/20 text-yellow-500 font-black rounded border border-yellow-500/30 shrink-0">LÍDER</span>}
        {isRunning && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />}
        {isCompleted && <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
        <button
          onClick={() => setCollapsed(false)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-foreground/10 text-muted hover:text-foreground transition-all"
          title="Expandir"
        >
          <ArrowRight size={11} className="rotate-90" />
        </button>
        <Handle type="target" position={Position.Top} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
        <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
        {isInsideSquad && (
          <>
            <Handle id="left-target" type="target" position={Position.Left} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
            <Handle id="right-source" type="source" position={Position.Right} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
          </>
        )}
      </div>
    );
  }

  /* —— MODO EXPANDIDO —— */

  return (
    <div className={`industrial-card p-3 min-w-[220px] transition-all duration-300 group ${statusColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isLeader
            ? <Crown size={14} className="text-yellow-500" />
            : <Bot size={14} className={isRunning ? 'text-[var(--accent)] animate-bounce' : 'text-[var(--accent)]/50'} />
          }
          {isLeader && (
            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 text-[8px] font-black rounded border border-yellow-500/30 uppercase tracking-widest">
              LÍDER
            </span>
          )}
          {!isInsideSquad && (
            <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)]">FUNCIONÁRIO IA</span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-foreground/5 text-muted hover:text-foreground transition-colors" title="Minimizar">
            <Minimize2 size={11} />
          </button>
          <button onClick={() => openAgentPanel?.(id)} className="p-1 rounded bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors" title="Soul & Skills">
            <Settings2 size={11} />
          </button>
          <Trash2 size={11} className="text-muted/50 hover:text-red-500 cursor-pointer" onClick={() => setNodes((nds) => nds.filter((n) => n.id !== id))} />
        </div>
      </div>

      <div className="space-y-2">
        {/* Seletor de agente — apenas fora da squad */}
        {!isInsideSquad && (
          <div className="space-y-1">
            <label className="text-[8px] font-black uppercase tracking-widest text-muted">Inteligência Base</label>
            <select
              className="w-full bg-background border border-border-weak p-2 rounded text-[10px] font-bold text-foreground outline-none focus:border-[var(--accent)]"
              value={data.agentId || ''}
              onChange={(e) => handleAgentSelect(e.target.value)}
            >
              <option value="">Selecionar Agente...</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-widest text-muted">Identidade</label>
          <input
            type="text"
            className="w-full bg-background border border-border-weak p-2 rounded text-[10px] font-bold text-foreground outline-none focus:border-[var(--accent)]"
            value={data.label || ''}
            onChange={(e) => updateData({ label: e.target.value })}
            placeholder="Ex: Copywriter Sênior"
          />
        </div>

        {(data.skills?.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {(data.skills as string[]).map((s) => (
              <span key={s} className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-bold border border-[var(--accent)]/20">
                {s.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={() => openAgentPanel?.(id)}
          className="w-full py-1 border border-dashed border-[var(--accent)]/30 rounded text-[9px] font-bold text-[var(--accent)]/60 hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-all flex items-center justify-center gap-1.5"
        >
          <Settings2 size={9} /> Soul · Skills · IA
        </button>
      </div>

      {isRunning && (
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[8px] font-mono text-[var(--accent)] uppercase tracking-tighter">
            <span>Processando Mandato...</span>
            <span className="animate-pulse">RUNNING</span>
          </div>
          <div className="h-1 w-full bg-foreground/10 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--accent)] w-full origin-left animate-[loading_2s_ease-in-out_infinite]" />
          </div>
        </div>
      )}
      {isCompleted && (
        <div className="mt-2 text-[9px] font-bold text-green-500/70 uppercase tracking-widest flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Mandato Concluído
        </div>
      )}
      {isFailed && (
        <div className="mt-2 text-[9px] font-bold text-red-500/70 uppercase tracking-widest flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> Falhou
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
      <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
      {/* Handles laterais para facilitar conexões dentro da squad */}
      {isInsideSquad && (
        <>
          <Handle id="left-target" type="target" position={Position.Left} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
          <Handle id="right-source" type="source" position={Position.Right} className="!w-4 !h-4 !bg-[var(--accent)] !border-2 !border-background hover:!scale-125 transition-transform" />
        </>
      )}
    </div>
  );
};

const HumanApprovalNode = ({ id, data }: any) => {
  const isWaiting = data.status === 'waiting_approval';
  const { setNodes } = useReactFlow();
  const collapsed = !!data.collapsed;
  const setCollapsed = (val: boolean) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, collapsed: val } } : n));

  const handleApprove = () => {
    window.dispatchEvent(new CustomEvent('resumeWorkflow', { detail: { nodeId: id, runId: data.runId } }));
  };

  if (collapsed) {
    return (
      <div className={`industrial-card px-3 py-2 flex items-center gap-2.5 min-w-[160px] transition-all duration-200 group cursor-default ${
        isWaiting ? 'border-orange-500 bg-orange-500/10 animate-pulse' : 'border-orange-500/30 bg-orange-500/5'
      }`}>
        <Users size={13} className="text-orange-500 shrink-0" />
        <span className="text-[11px] font-black text-foreground truncate flex-1">{data.label || 'Aprovação'}</span>
        {isWaiting && <span className="text-[7px] px-1 py-0.5 bg-orange-500/20 text-orange-500 font-black rounded border border-orange-500/30 shrink-0">AGUARDANDO</span>}
        <button
          onClick={() => setCollapsed(false)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-foreground/10 text-muted hover:text-foreground transition-all"
        >
          <ArrowRight size={11} className="rotate-90" />
        </button>
        <Handle type="target" position={Position.Top} className="!w-4 !h-4 !bg-orange-500 !border-2 !border-background hover:!scale-125 transition-transform" />
        <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-orange-500 !border-2 !border-background hover:!scale-125 transition-transform" />
      </div>
    );
  }

  return (
    <div className={`industrial-card p-4 min-w-[240px] transition-all duration-700 group ${
      isWaiting ? 'border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.4)] bg-orange-500/10 animate-pulse' : 'border-orange-500/30 bg-orange-500/5'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded border transition-colors ${isWaiting ? 'bg-orange-500 text-white border-orange-400' : 'bg-orange-500/20 text-orange-500 border-orange-500/30'}`}>
            <Users size={16} />
          </div>
          <div className="font-mono text-[10px] font-bold tracking-widest text-orange-500">APROVAÇÃO HUMANA</div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-foreground/5 text-muted hover:text-foreground transition-colors" title="Minimizar">
            <Minimize2 size={11} />
          </button>
          <Trash2
            size={14}
            className="text-muted/50 hover:text-red-500 cursor-pointer"
            onClick={() => setNodes((nds) => nds.filter((n) => n.id !== id))}
          />
        </div>
      </div>

      <input
          type="text"
          className="w-full bg-transparent border-none text-sm font-bold text-foreground focus:ring-0 p-0 mb-4 placeholder:opacity-30"
          value={data.label}
          onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, label: e.target.value } } : n))}
          placeholder="Título da Aprovação"
        />

      <div className="space-y-3 mb-4">
        <div className="space-y-1">
          <label className="text-[8px] font-black uppercase tracking-widest text-muted">Aprovador (nome ou @usuário)</label>
          <input
            type="text"
            className="w-full bg-background border border-border-weak p-2 rounded text-[10px] font-bold text-foreground outline-none focus:border-orange-500 placeholder:opacity-40"
            placeholder="Ex: @joao ou joao@empresa.com (recebe no Telegram/WhatsApp)"
            value={data.approver || ''}
            onChange={(e) => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, approver: e.target.value } } : n))}
          />
        </div>
        <div>
          <label className="text-[8px] font-black uppercase tracking-widest text-muted block mb-1.5">Notificar via</label>
          <div className="flex gap-2">
            <button
              onClick={() => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, notifyTelegram: !n.data.notifyTelegram } } : n))}
              className={`flex-1 py-1.5 rounded border text-[9px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                data.notifyTelegram ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-background border-border-weak text-muted hover:border-blue-500/30'
              }`}
            >
              <Send size={10} /> Telegram
            </button>
            <button
              onClick={() => setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, notifyWhatsapp: !n.data.notifyWhatsapp } } : n))}
              className={`flex-1 py-1.5 rounded border text-[9px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                data.notifyWhatsapp ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-background border-border-weak text-muted hover:border-green-500/30'
              }`}
            >
              <MessageSquare size={10} /> WhatsApp
            </button>
          </div>
        </div>
      </div>

      {isWaiting ? (
        <button
          onClick={handleApprove}
          className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded shadow-lg shadow-orange-500/20 transition-all"
        >
          APROVAR EXECUÇÃO
        </button>
      ) : (
        <div className="text-[10px] text-muted font-mono uppercase tracking-tighter text-center py-1">
          Aguardando Fluxo...
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!w-4 !h-4 !bg-orange-500 !border-2 !border-background hover:!scale-125 transition-transform" />
      <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-orange-500 !border-2 !border-background hover:!scale-125 transition-transform" />
    </div>
  );
};

const TriggerNode = ({ id, data }: any) => {
  const { setNodes } = useReactFlow();
  return (
    <div className="industrial-card p-4 min-w-[200px] border-green-500/50 bg-green-500/5 transition-colors group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-green-500/20 text-green-500 border border-green-500/30">
            <Play size={16} />
          </div>
          <div className="font-mono text-xs font-bold tracking-widest text-green-500">START EVENT</div>
        </div>
        <Trash2 
          size={14} 
          className="text-muted/50 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" 
          onClick={() => setNodes((nds) => nds.filter((n) => n.id !== id))}
        />
      </div>
      <div className="text-sm font-bold text-foreground uppercase tracking-widest leading-none">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-green-500 !border-2 !border-background hover:!scale-125 transition-transform" />
    </div>
  );
};

// ── SpawnAgentNode — Fase 21: Sub-agentes dinâmicos ──
const SpawnAgentNode = ({ id, data }: any) => {
  const { setNodes } = useReactFlow();
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const spawnType = data.spawnConfig?.spawnType || 'parallel';
  const agents = data.spawnConfig?.agents || [];
  const status = data.spawnStatus || 'idle'; // idle, spawning, running, completed
  const activeCount = data.activeCount || 0;
  const completedCount = data.completedCount || 0;

  const spawnTypeLabels: Record<string, string> = {
    parallel: 'Paralelo',
    sequential: 'Sequencial',
    conditional: 'Condicional',
    dynamic: 'Dinâmico (IA)',
  };

  const updateConfig = (patch: any) => {
    setNodes(nds => nds.map(n =>
      n.id === id ? { ...n, data: { ...n.data, spawnConfig: { ...n.data.spawnConfig, ...patch } } } : n
    ));
  };

  const addSubAgent = () => {
    const newAgents = [...agents, { name: `Sub-Agente ${agents.length + 1}`, mandate: '', model: 'google/gemini-2.0-flash-001' }];
    updateConfig({ agents: newAgents });
  };

  const removeSubAgent = (idx: number) => {
    updateConfig({ agents: agents.filter((_: any, i: number) => i !== idx) });
  };

  const updateSubAgent = (idx: number, field: string, value: string) => {
    const updated = agents.map((a: any, i: number) => i === idx ? { ...a, [field]: value } : a);
    updateConfig({ agents: updated });
  };

  return (
    <div className={`industrial-card p-3 min-w-[240px] max-w-[320px] border-yellow-500/50 bg-yellow-500/5 transition-colors group relative ${status === 'running' ? 'animate-pulse' : ''}`}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-yellow-500 !border-2 !border-background" />

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
          <div className="p-1.5 rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
            <Sparkles size={14} />
          </div>
          <span className="font-mono text-[10px] font-bold tracking-widest text-yellow-500 uppercase">Spawn Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted/60 font-mono">{spawnTypeLabels[spawnType]}</span>
          <Trash2
            size={12}
            className="text-muted/50 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setNodes(nds => nds.filter(n => n.id !== id))}
          />
        </div>
      </div>

      {/* Status badges durante execução */}
      {status !== 'idle' && (
        <div className="flex gap-2 mb-2">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${status === 'running' ? 'bg-yellow-500/20 text-yellow-400' : status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-muted/20 text-muted'}`}>
            {status === 'spawning' ? 'Criando...' : status === 'running' ? `${activeCount} rodando` : `${completedCount} concluídos`}
          </span>
        </div>
      )}

      {!collapsed && (
        <div className="space-y-2 mt-2">
          {/* Tipo de spawn */}
          <select
            value={spawnType}
            onChange={(e) => updateConfig({ spawnType: e.target.value })}
            className="w-full text-[10px] bg-surface border border-border-strong p-1.5 rounded font-mono"
          >
            <option value="parallel">Paralelo (fan-out)</option>
            <option value="sequential">Sequencial (cadeia)</option>
            <option value="conditional">Condicional</option>
            <option value="dynamic">Dinâmico (IA decide)</option>
          </select>

          {/* Sub-agentes configurados */}
          {(spawnType === 'parallel' || spawnType === 'sequential') && (
            <>
              {agents.map((agent: any, idx: number) => (
                <div key={idx} className="border border-border-strong/50 rounded p-2 space-y-1 bg-surface/50">
                  <div className="flex items-center justify-between">
                    <input
                      value={agent.name}
                      onChange={(e) => updateSubAgent(idx, 'name', e.target.value)}
                      className="text-[10px] font-bold bg-transparent border-none outline-none flex-1 text-foreground"
                      placeholder="Nome do sub-agente"
                    />
                    <Trash2
                      size={10}
                      className="text-muted/50 hover:text-red-500 cursor-pointer"
                      onClick={() => removeSubAgent(idx)}
                    />
                  </div>
                  <input
                    value={agent.mandate || ''}
                    onChange={(e) => updateSubAgent(idx, 'mandate', e.target.value)}
                    className="w-full text-[9px] bg-transparent border border-border-strong/30 rounded px-1.5 py-1 outline-none text-muted"
                    placeholder="Mandato: o que este sub-agente deve fazer"
                  />
                  <select
                    value={agent.model || 'google/gemini-2.0-flash-001'}
                    onChange={(e) => updateSubAgent(idx, 'model', e.target.value)}
                    className="w-full text-[9px] bg-surface border border-border-strong/30 p-1 rounded"
                  >
                    <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                    <option value="openai/gpt-4o">GPT-4o</option>
                    <option value="anthropic/claude-haiku-4-5">Claude Haiku</option>
                    <option value="deepseek/deepseek-chat">DeepSeek V3</option>
                    <option value="google/gemini-2.0-flash-exp:free">Gemini Flash (Grátis)</option>
                    <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 (Grátis)</option>
                  </select>
                </div>
              ))}
              {agents.length < 5 && (
                <button
                  onClick={addSubAgent}
                  className="w-full text-[9px] font-mono border border-dashed border-yellow-500/30 text-yellow-500/60 hover:text-yellow-500 hover:border-yellow-500/60 rounded py-1.5 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus size={10} /> Adicionar Sub-Agente
                </button>
              )}
            </>
          )}

          {/* Modo dinâmico */}
          {spawnType === 'dynamic' && (
            <textarea
              value={data.spawnConfig?.dynamicInstruction || ''}
              onChange={(e) => updateConfig({ dynamicInstruction: e.target.value })}
              className="w-full text-[9px] bg-surface border border-border-strong/30 rounded p-1.5 outline-none text-muted resize-none"
              rows={3}
              placeholder="Instrução para a IA decidir quais sub-agentes criar... Ex: 'Crie um agente para cada item da lista'"
            />
          )}

          {/* Modo condicional */}
          {spawnType === 'conditional' && (
            <>
              <input
                value={data.spawnConfig?.condition || ''}
                onChange={(e) => updateConfig({ condition: e.target.value })}
                className="w-full text-[9px] bg-surface border border-border-strong/30 rounded px-1.5 py-1 outline-none text-muted"
                placeholder="Condição (ex: 'always' ou texto a buscar no input)"
              />
              <input
                value={data.spawnConfig?.conditionalAgent?.name || ''}
                onChange={(e) => updateConfig({ conditionalAgent: { ...data.spawnConfig?.conditionalAgent, name: e.target.value } })}
                className="w-full text-[9px] bg-surface border border-border-strong/30 rounded px-1.5 py-1 outline-none"
                placeholder="Nome do sub-agente condicional"
              />
              <input
                value={data.spawnConfig?.conditionalAgent?.mandate || ''}
                onChange={(e) => updateConfig({ conditionalAgent: { ...data.spawnConfig?.conditionalAgent, mandate: e.target.value } })}
                className="w-full text-[9px] bg-surface border border-border-strong/30 rounded px-1.5 py-1 outline-none text-muted"
                placeholder="Mandato do sub-agente"
              />
            </>
          )}
        </div>
      )}

      {/* Depth badge */}
      <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
        {data.spawnConfig?.maxDepth ?? 3}
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-yellow-500 !border-2 !border-background" />
    </div>
  );
};

const SquadNode = ({ id, data }: any) => {
  const zoom = useStore((s) => s.transform[2]);
  const isZoomedIn = zoom > 0.4;
  const { setNodes, setEdges } = useReactFlow();
  const [agents, setAgents] = useState<any[]>([]);

  React.useEffect(() => {
    api.get('/dashboard/agents')
      .then((res) => setAgents(res.data?.agents || res.data || []))
      .catch(() => {});
  }, []);

  // Garante que o líder tenha um AgentNode dentro da squad (ao carregar squad salva)
  React.useEffect(() => {
    if (!data.leaderId || agents.length === 0) return;
    setNodes((nds) => {
      const leaderNodeExists = nds.some(
        (n) => n.parentId === id && n.data?.agentId === data.leaderId
      );
      if (leaderNodeExists) return nds;
      const agent = agents.find((a: any) => a.id === data.leaderId);
      const leaderNode: Node = {
        id: `agent-leader-${Date.now()}`,
        type: 'agent',
        position: { x: 30, y: 80 },
        data: {
          label: agent?.name || data.leaderName || 'Líder',
          agentId: data.leaderId,
          status: 'idle',
          role: 'leader',
          collapsed: false,
        },
        parentId: id,
        extent: 'parent' as const,
      };
      return [...nds, leaderNode];
    });
  }, [data.leaderId, agents, id, setNodes]);

  const updateData = (updates: any) =>
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...updates } } : n));

  const handleLeaderSelect = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    updateData({ leaderId: agentId, leaderName: agent?.name || '' });
    // O useEffect acima vai criar o AgentNode automaticamente
  };

  const addEmployee = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newNodeId = `agent-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'agent',
      position: { x: 60 + Math.random() * 200, y: 160 },
      data: { label: 'Novo Funcionário', status: 'idle', role: 'employee', collapsed: false },
      parentId: id,
      extent: 'parent' as const,
    };
    setNodes((nds) => nds.concat(newNode));
  };

  return (
    <div className="relative industrial-card p-4 min-h-[300px] border-dashed border-[var(--accent)]/30 bg-[var(--accent)]/[0.02] rounded-xl group hover:border-[var(--accent)]/50 transition-all w-full h-full">
      <NodeResizer
        minWidth={360}
        minHeight={260}
        isVisible={true}
        lineStyle={{ stroke: 'var(--accent)', strokeWidth: 1, opacity: 0.4 }}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', border: '2px solid white', opacity: 0.7 }}
      />
      {/* Header */}
      <div className="absolute -top-3 left-4 px-3 py-0.5 bg-background border border-[var(--accent)]/40 rounded text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest shadow-sm flex items-center gap-2 pointer-events-auto">
        <Users size={10} />
        <span>SQUAD: {data.label || 'Sem Nome'}</span>
        {data.leaderName && (
          <>
            <span className="text-muted/40">·</span>
            <Crown size={9} className="text-yellow-500 shrink-0" />
            <span className="text-yellow-500 font-black">{data.leaderName}</span>
          </>
        )}
        <Trash2
          size={10}
          className="ml-2 text-muted/50 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            setNodes((nds) => nds.filter((n) => n.id !== id && n.parentId !== id));
          }}
        />
      </div>

      {/* Seleção de Líder */}
      <div className="pointer-events-auto mt-2 relative">
        <div className="flex items-center gap-2 p-2 bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-lg">
          <Crown size={12} className="text-yellow-500 shrink-0" />
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] shrink-0">LÍDER</span>
          <select
            className="flex-1 bg-transparent border-none text-[10px] font-bold text-foreground outline-none cursor-pointer"
            value={data.leaderId || ''}
            onChange={(e) => handleLeaderSelect(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">Selecionar agente líder...</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {data.leaderId && (
            <div className="flex items-center gap-1 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[8px] text-green-500 font-bold">ATIVO</span>
            </div>
          )}
        </div>
        {/* Conexões são feitas entre AgentNodes dentro da squad (arraste de handle para handle) */}
      </div>

      {/* Área de funcionários */}
      <div className="mt-4 w-full h-28 pointer-events-none flex items-center justify-center opacity-[0.03]">
        <Users size={80} className="text-foreground" />
      </div>

      {isZoomedIn && !data.leaderId && (
        <div className="absolute top-20 left-0 right-0 flex flex-col items-center pointer-events-none">
          <p className="text-[9px] text-muted/40 font-mono uppercase tracking-widest">
            Selecione o líder acima e adicione funcionários
          </p>
        </div>
      )}

      {isZoomedIn && (
        <button
          onClick={addEmployee}
          className="absolute bottom-4 right-4 p-2 bg-[var(--accent)] text-white rounded-lg shadow-lg hover:scale-105 transition-transform pointer-events-auto flex items-center gap-2 px-3 group/btn z-50"
        >
          <Plus size={12} className="group-hover/btn:rotate-90 transition-transform" />
          <span className="text-[9px] font-bold uppercase tracking-tighter">+ Funcionário</span>
        </button>
      )}

      <div className="absolute bottom-4 left-4 pointer-events-none opacity-25">
        <span className="text-[8px] font-mono font-bold tracking-tighter uppercase text-muted">
          {isZoomedIn ? '⚡ Squad Command Center' : 'Squad Unit'}
        </span>
      </div>
    </div>
  );
};

// --- PAINEL LATERAL DO AGENTE ---
const SKILLS_CONFIG = [
  { id: 'web_search',       icon: '🔍', label: 'Web Search' },
  { id: 'knowledge_search', icon: '🧠', label: 'Knowledge' },
  { id: 'scrape_url',       icon: '🌐', label: 'Scrape URL' },
  { id: 'write_memory',     icon: '💾', label: 'Memória' },
  { id: 'create_post',      icon: '✍️',  label: 'Criar Post' },
  { id: 'call_api',         icon: '⚡', label: 'Call API' },
];

const MODELS = [
  { value: '', label: 'Padrão do agente' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku' },
  { value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
];

const AgentPanelOverlay = ({
  nodeId,
  nodes,
  setNodes,
  onClose,
}: {
  nodeId: string;
  nodes: any[];
  setNodes: any;
  onClose: () => void;
}) => {
  const node = nodes.find((n) => n.id === nodeId);
  const [dragging, setDragging] = useState(false);
  if (!node) return null;
  const data = node.data;
  const activeSkills: string[] = data.skills || [];

  const update = (updates: any) =>
    setNodes((nds: any[]) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n))
    );

  const toggleSkill = (skill: string) => {
    const next = activeSkills.includes(skill)
      ? activeSkills.filter((s) => s !== skill)
      : [...activeSkills, skill];
    update({ skills: next });
  };

  // Arquivos são salvos como array de {name, content} no data.files
  const savedFiles: { name: string; content: string }[] = data.files || [];

  const processFiles = async (fileList: File[]) => {
    const valid = fileList.filter((f) => f.name.endsWith('.md') || f.name.endsWith('.txt'));
    if (valid.length === 0) return;
    const newFiles: { name: string; content: string }[] = [];
    for (const file of valid) {
      const text = await file.text();
      newFiles.push({ name: file.name, content: text });
    }
    update({ files: [...savedFiles, ...newFiles] });
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    await processFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (index: number) => {
    update({ files: savedFiles.filter((_: any, i: number) => i !== index) });
  };

  return (
    <div className="absolute inset-y-0 right-0 w-[380px] bg-surface border-l border-border-strong z-50 flex flex-col shadow-2xl animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="p-4 border-b border-border-strong flex items-center justify-between bg-[var(--accent)]/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30">
            <Bot size={16} />
          </div>
          <div>
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">Configuração do Funcionário</div>
            <div className="text-sm font-black text-foreground truncate max-w-[200px]">{data.label || 'Agente'}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-foreground/5 text-muted hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">

        {/* SOUL.md */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center gap-1.5">
            <Crown size={10} className="text-yellow-500" /> SOUL.md — Personalidade e Regras
          </label>
          <textarea
            className="w-full h-28 bg-background border border-border-weak p-3 rounded text-[10px] font-mono text-foreground outline-none focus:border-[var(--accent)] resize-none leading-relaxed"
            placeholder={'# Personalidade\nSou especialista em...\n\n## Regras\n- Sempre cite fontes\n- Responda em português'}
            value={data.soul || ''}
            onChange={(e) => update({ soul: e.target.value })}
          />
        </div>

        {/* Arquivos .md — Drop Zone + Lista */}
        <div
          className="space-y-1.5"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleFileDrop}
        >
          <label className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center gap-1.5">
            <Database size={10} /> Arquivos de Conhecimento
          </label>

          {/* Drop zone */}
          <div className={`relative border-2 border-dashed rounded p-3 text-center transition-all cursor-pointer ${
            dragging ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-border-weak hover:border-[var(--accent)]/40'
          }`}>
            <label className="cursor-pointer flex flex-col items-center gap-1">
              <Plus size={14} className="text-muted" />
              <span className="text-[9px] font-bold text-muted uppercase tracking-widest">
                {dragging ? 'Solte aqui' : 'Arraste .md / .txt ou clique'}
              </span>
              <input
                type="file"
                accept=".md,.txt"
                multiple
                className="hidden"
                onChange={async (e) => {
                  await processFiles(Array.from(e.target.files || []));
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Lista de arquivos salvos */}
          {savedFiles.length > 0 && (
            <div className="space-y-1">
              {savedFiles.map((f: { name: string; content: string }, i: number) => (
                <div key={i} className="flex items-center gap-2 p-1.5 bg-background border border-border-weak rounded group">
                  <Database size={9} className="text-[var(--accent)] shrink-0" />
                  <span className="text-[9px] font-bold text-foreground flex-1 truncate">{f.name}</span>
                  <span className="text-[7px] text-muted font-mono">{(f.content.length / 1024).toFixed(1)}kb</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/10 rounded transition-all"
                    title="Remover"
                  >
                    <X size={9} className="text-red-500" />
                  </button>
                </div>
              ))}
              <p className="text-[7px] text-muted/40 font-bold uppercase tracking-widest">
                {savedFiles.length} arquivo{savedFiles.length > 1 ? 's' : ''} — injetados no contexto do agente
              </p>
            </div>
          )}
        </div>

        {/* Mandato */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center gap-1.5">
            <ChevronRight size={10} /> Mandato Específico
          </label>
          <textarea
            className="w-full h-24 bg-background border border-border-weak p-3 rounded text-[10px] font-mono text-foreground outline-none focus:border-[var(--accent)] resize-none leading-relaxed"
            placeholder="Pesquise as últimas tendências em IA e retorne 5 insights principais com fontes..."
            value={data.prompt || ''}
            onChange={(e) => update({ prompt: e.target.value })}
          />
        </div>

        {/* Skills */}
        <div className="space-y-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center gap-1.5">
            <Zap size={10} className="text-[var(--accent)]" /> Skills Ativas
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {SKILLS_CONFIG.map((s) => (
              <button
                key={s.id}
                onClick={() => toggleSkill(s.id)}
                className={`py-2 px-2.5 rounded border text-[9px] font-bold flex items-center gap-1.5 transition-all ${
                  activeSkills.includes(s.id)
                    ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]'
                    : 'bg-background border-border-weak text-muted hover:border-[var(--accent)]/30'
                }`}
              >
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modelo IA */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center gap-1.5">
            <Brain size={10} /> Modelo IA (override)
          </label>
          <select
            className="w-full bg-background border border-border-weak p-2 rounded text-[10px] font-bold text-foreground outline-none focus:border-[var(--accent)]"
            value={data.modelOverride || ''}
            onChange={(e) => update({ modelOverride: e.target.value })}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Skin / Persona + Arquivos de Persona */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-widest text-muted flex items-center gap-1.5">
            <Bot size={10} /> Persona / Skin
          </label>
          <input
            className="w-full bg-background border border-border-weak p-2 rounded text-[10px] text-foreground outline-none focus:border-[var(--accent)]"
            placeholder="Ex: Analista Sênior de Marketing"
            value={data.skin || ''}
            onChange={(e) => update({ skin: e.target.value })}
          />

          {/* Drop zone para arquivos de persona/skills */}
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = Array.from(e.dataTransfer.files).filter(
                (f) => f.name.endsWith('.md') || f.name.endsWith('.txt')
              );
              if (files.length === 0) return;
              const newFiles: { name: string; content: string }[] = [];
              for (const file of files) {
                const text = await file.text();
                newFiles.push({ name: file.name, content: text });
              }
              update({ personaFiles: [...(data.personaFiles || []), ...newFiles] });
            }}
            className="border border-dashed border-border-weak rounded p-2 text-center hover:border-[var(--accent)]/40 transition-all"
          >
            <label className="cursor-pointer flex flex-col items-center gap-0.5">
              <span className="text-[8px] font-bold text-muted uppercase tracking-widest">
                Arraste .md de persona/skills ou clique
              </span>
              <input
                type="file"
                accept=".md,.txt"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  const newFiles: { name: string; content: string }[] = [];
                  for (const file of files) {
                    const text = await file.text();
                    newFiles.push({ name: file.name, content: text });
                  }
                  update({ personaFiles: [...(data.personaFiles || []), ...newFiles] });
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Lista de arquivos de persona */}
          {(data.personaFiles || []).length > 0 && (
            <div className="space-y-1">
              {(data.personaFiles as { name: string; content: string }[]).map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-1.5 bg-background border border-border-weak rounded group">
                  <Bot size={9} className="text-[var(--accent)] shrink-0" />
                  <span className="text-[9px] font-bold text-foreground flex-1 truncate">{f.name}</span>
                  <span className="text-[7px] text-muted font-mono">{(f.content.length / 1024).toFixed(1)}kb</span>
                  <button
                    onClick={() => update({ personaFiles: (data.personaFiles || []).filter((_: any, idx: number) => idx !== i) })}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/10 rounded transition-all"
                    title="Remover"
                  >
                    <X size={9} className="text-red-500" />
                  </button>
                </div>
              ))}
              <p className="text-[7px] text-muted/40 font-bold uppercase tracking-widest">
                Persona e skills extras injetados no prompt
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border-strong bg-surface/50">
        <div className="flex items-center gap-2 text-[8px] text-muted font-mono uppercase">
          <Save size={9} className="text-green-500" />
          <span>Salvo automaticamente no canvas</span>
        </div>
      </div>
    </div>
  );
};

// Edge deletável — mostra botão × ao clicar/selecionar a aresta
const DeletableEdge = ({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, style, markerEnd, selected,
}: any) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      {/* Área clicável invisível mais larga para facilitar seleção */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{
        ...style,
        stroke: selected ? '#ef4444' : style?.stroke,
        strokeWidth: selected ? 2.5 : style?.strokeWidth,
      }} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
            className="absolute nodrag nopan"
          >
            <button
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setEdges((eds) => eds.filter((e2) => e2.id !== id)); }}
              className="w-7 h-7 rounded-full bg-red-500 text-white text-[13px] font-black flex items-center justify-center shadow-lg hover:bg-red-600 active:scale-95 transition-all border-2 border-white cursor-pointer"
              title="Remover conexão"
            >×</button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// Botão Executar — lê onRun do contexto (sempre atualizado, sem problema de closure)
const ExecuteButton = () => {
  const { onRun } = useContext(WorkflowCanvasContext);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState('');

  const handleClick = async () => {
    if (!onRun || running) return;
    setRunning(true);
    try {
      await onRun();
      setToast('Squad disparada! Acompanhe o status nos nós.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={!onRun || running}
        className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-green-500/20 transition-all"
      >
        {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
        {running ? 'Disparando...' : 'Executar'}
      </button>
      {toast && (
        <div className="absolute bottom-12 right-0 w-64 bg-green-500 text-white text-[9px] font-bold p-3 rounded-xl shadow-xl whitespace-normal leading-relaxed animate-in slide-in-from-bottom-2">
          ✅ {toast}
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  agent: AgentNode,
  trigger: TriggerNode,
  squad: SquadNode,
  human_approval: HumanApprovalNode,
  spawn_agent: SpawnAgentNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

// Canvas começa vazio — squads são carregadas do banco ou criadas pelo usuário
const defaultNodes: Node[] = [];
const defaultEdges: Edge[] = [];

export type FlowBuilderWorkflow = {
  id: string;
  name?: string;
  description?: string;
  definition?: { nodes?: Node[]; edges?: Edge[] };
};

function FlowContent({
  workflow,
  onSaveDefinition,
  onRun,
}: {
  workflow?: FlowBuilderWorkflow | null;
  onSaveDefinition?: (def: { nodes: Node[]; edges: Edge[] }) => void | Promise<void>;
  onRun?: () => void | Promise<void>;
}) {
  const def = workflow?.definition;
  const initialNodes = useMemo(() => (def?.nodes?.length ? def.nodes : defaultNodes), []);
  const initialEdges = useMemo(() => (def?.edges?.length ? def.edges : defaultEdges), []);
  const [agentPanelNodeId, setAgentPanelNodeId] = useState<string | null>(null);
  const openAgentPanel = useCallback((nodeId: string) => setAgentPanelNodeId(nodeId), []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // LIVE_SYNC — WebSocket para atualizar status dos nós em tempo real
  useEffect(() => {
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1')
      .replace(/^http/, 'ws')
      .replace('/v1', '') + '/v1/squads/ws';

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'agent_status' && msg.agentId) {
            setNodes((nds) =>
              nds.map((n) =>
                n.data?.agentId === msg.agentId || n.id === msg.agentId
                  ? { ...n, data: { ...n.data, status: msg.status } }
                  : n
              )
            );
          }
          // Spawn Agent status real-time
          if (msg.type === 'spawn_status' && msg.nodeId) {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === msg.nodeId
                  ? { ...n, data: { ...n.data, spawnStatus: msg.status, activeCount: msg.activeCount, completedCount: msg.completedCount } }
                  : n
              )
            );
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      ws?.close();
    };
  }, [setNodes]);
  const { theme } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { fitView } = useReactFlow();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref para evitar auto-save logo após carregar um workflow novo (evita sobrescrever com nós errados)
  const isLoadingRef = useRef(false);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Carregar definition quando workflow (ou sua definition) mudar
  useEffect(() => {
    if (!workflow?.definition?.nodes?.length) return;
    isLoadingRef.current = true; // bloqueia auto-save durante o carregamento
    // Sanitiza: garante que todo nó tem position válida (evita crash no ReactFlow)
    const safeNodes = (workflow.definition.nodes as Node[]).map((n, i) => ({
      ...n,
      position: (n.position?.x != null && n.position?.y != null)
        ? n.position
        : { x: 100 + (i % 4) * 220, y: 100 + Math.floor(i / 4) * 180 }
    }));
    setNodes(safeNodes);
    // Deduplica edges pelo ID antes de carregar (evita key duplicado no React)
    const rawEdges = (workflow.definition.edges || []) as Edge[];
    const seenIds = new Set<string>();
    const uniqueEdges = rawEdges.filter((e) => {
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      return true;
    });
    setEdges(uniqueEdges);
    // Libera auto-save após o React processar os novos nós
    setTimeout(() => { isLoadingRef.current = false; }, 100);
  }, [workflow?.id, workflow?.definition]);

  // Quando troca de workflow, limpa canvas para não mostrar nós da squad anterior
  useEffect(() => {
    if (!workflow?.id) {
      setNodes([]);
      setEdges([]);
    }
  }, [workflow?.id]);

  // Salvar canvas (debounced) quando nodes/edges mudarem
  useEffect(() => {
    if (!workflow?.id || !onSaveDefinition) return;
    if (isLoadingRef.current) return; // não salva durante carregamento
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (!isLoadingRef.current) {
        console.log('[AUTO-SAVE] Salvando canvas...', nodes.length, 'nós', nodes.map(n => ({ id: n.id, collapsed: n.data?.collapsed })));
        onSaveDefinition({ nodes, edges });
      }
      saveTimeoutRef.current = null;
    }, 1500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, workflow?.id, onSaveDefinition]);

  React.useEffect(() => {
    const handleAddNode = (e: any) => {
      const type = e.detail;
      const nodeId = `${type}-${Date.now()}`;

      setNodes((nds) => {
        // Se está adicionando um agente e existe um SquadNode, adiciona dentro dele
        const squadNode = type === 'agent' ? nds.find((n) => n.type === 'squad') : null;

        const newNode: Node = {
          id: nodeId,
          type,
          position: squadNode
            ? { x: 60 + Math.random() * 160, y: 160 + Math.random() * 80 }
            : { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
          data: {
            label: type === 'agent' ? 'Novo Funcionário' :
                   type === 'squad' ? 'Unidade Alpha' :
                   type === 'human_approval' ? 'Aprovação Necessária' :
                   type === 'spawn_agent' ? 'Spawn Agent' :
                   'Evento de Gatilho',
            status: 'idle',
            ...(squadNode ? { role: 'employee' } : {}),
            ...(type === 'spawn_agent' ? { spawnConfig: { spawnType: 'parallel', agents: [], maxDepth: 3, maxAgents: 5 } } : {})
          },
          ...(squadNode ? { parentId: squadNode.id, extent: 'parent' as const } : {}),
          ...(type === 'squad' ? { style: { width: 520, height: 320 } } : {})
        };

        return nds.concat(newNode);
      });
    };

    const handleResume = async (e: any) => {
      const { runId } = e.detail;
      try {
        await api.post(`/workflows/runs/${runId}/resume`, { approved: true });
      } catch (err) {
        console.error('Falha ao retomar workflow:', err);
      }
    };

    window.addEventListener('addNode', handleAddNode);
    window.addEventListener('resumeWorkflow', handleResume);
    return () => {
      window.removeEventListener('addNode', handleAddNode);
      window.removeEventListener('resumeWorkflow', handleResume);
    };
  }, [setNodes]);

  // Permite conexão entre quaisquer nós, inclusive dentro da mesma squad
  const isValidConnection = useCallback((connection: Connection) => {
    return connection.source !== connection.target; // só bloqueia auto-conexão
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => {
      const newEdge = { ...params, type: 'deletable', animated: true, style: { strokeWidth: 2, stroke: 'var(--accent)' } };
      // Evita duplicatas pelo par source+target+handle
      const duplicate = eds.some(
        (e) => e.source === params.source && e.target === params.target &&
               e.sourceHandle === params.sourceHandle && e.targetHandle === params.targetHandle
      );
      if (duplicate) return eds;
      return addEdge(newEdge, eds);
    }),
    [setEdges]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      if (node.type === 'squad') return;
      if (node.position?.x == null || node.position?.y == null) return;

      const squadNode = nodes.find(
        (n) =>
          n.type === 'squad' &&
          n.position?.x != null &&
          node.position.x >= n.position.x &&
          node.position.x <= n.position.x + (n.measured?.width ?? 400) &&
          node.position.y >= n.position.y &&
          node.position.y <= n.position.y + (n.measured?.height ?? 300)
      );

      if (squadNode && node.parentId !== squadNode.id) {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === node.id) {
              return {
                ...n,
                parentId: squadNode.id,
                extent: 'parent' as const,
                position: {
                  x: node.position.x - squadNode.position.x,
                  y: node.position.y - squadNode.position.y,
                },
              };
            }
            return n;
          })
        );
      }
    },
    [nodes, setNodes]
  );

  const toggleFullscreen = () => {
    if (isFullscreen) {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    } else {
      const el = document.documentElement;
      el.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    }
    setTimeout(() => fitView(), 200);
  };

  if (!mounted) return null;

  return (
    <WorkflowCanvasContext.Provider value={{ onRun, squadId: workflow?.id, openAgentPanel }}>
      <div className={`${isFullscreen ? 'fixed inset-0 z-[9999] bg-background w-screen h-screen' : 'w-full h-full border border-[var(--border-weak)] rounded-xl bg-background overflow-hidden relative shadow-2xl'}`}>
        <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStop={onNodeDragStop}
        onEdgeDoubleClick={(_, edge) => setEdges((eds) => eds.filter((e) => e.id !== edge.id))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        colorMode={theme as any}
        snapToGrid
        snapGrid={[12, 12]}
        elevateNodesOnSelect
        selectNodesOnDrag={false}
        nodesDraggable
        connectionRadius={40}
        defaultEdgeOptions={{
            type: 'deletable',
            animated: true,
            style: { strokeWidth: 2, stroke: 'var(--accent)' }
        }}
      >
        <Background 
          gap={24} 
          color={theme === 'dark' ? '#333' : '#ccc'} 
          className="opacity-20" 
        />
        <Controls className="bg-surface border-border-strong text-foreground fill-foreground" />
        <MiniMap 
          nodeColor={(n) => {
            if (n.type === 'trigger') return '#22c55e';
            if (n.type === 'agent') return 'var(--accent)';
            if (n.type === 'human_approval') return '#f97316';
            if (n.type === 'squad') return '#333';
            return '#eee';
          }}
          maskColor={theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'}
          className="bg-surface border-border-strong"
        />
        
        {/* Status top-right compacto */}
        <Panel position="top-right" className="flex gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface/80 backdrop-blur-md border border-border-strong rounded-lg shadow">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-green-500 font-mono">LIVE_SYNC</span>
            <div className="w-px h-4 bg-border-strong mx-1" />
            <button onClick={toggleFullscreen} className="p-1 hover:bg-foreground/5 rounded text-muted hover:text-foreground transition-colors" title={isFullscreen ? 'Sair do Fullscreen' : 'Tela cheia'}>
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </Panel>

        {/* Barra de ações inferior — adicionar nós + executar */}
        <Panel position="bottom-center" className="mb-3">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-surface/95 backdrop-blur-md border border-border-strong rounded-2xl shadow-2xl">
            {/* Adicionar funcionário */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('addNode', { detail: 'agent' }))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)] hover:bg-[var(--accent)]/15 hover:border-[var(--accent)]/60 transition-all text-[10px] font-black uppercase tracking-wide"
            >
              <Bot size={13} />
              + Funcionário
            </button>

            {/* Adicionar aprovação */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('addNode', { detail: 'human_approval' }))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-orange-500/30 bg-orange-500/5 text-orange-500 hover:bg-orange-500/15 hover:border-orange-500/60 transition-all text-[10px] font-black uppercase tracking-wide"
            >
              <Users size={13} />
              + Aprovação
            </button>

            {/* Adicionar squad */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('addNode', { detail: 'squad' }))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 hover:border-blue-500/60 transition-all text-[10px] font-black uppercase tracking-wide"
            >
              <Users size={13} />
              + Squad
            </button>

            {/* Spawn Agent */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('addNode', { detail: 'spawn_agent' }))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-yellow-500 hover:bg-yellow-500/15 hover:border-yellow-500/60 transition-all text-[10px] font-black uppercase tracking-wide"
            >
              <Sparkles size={13} />
              + Spawn
            </button>

            <div className="w-px h-8 bg-border-strong mx-1" />

            {/* Limpar canvas */}
            <button
              onClick={() => setNodes([])}
              className="p-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-all"
              title="Limpar canvas"
            >
              <Trash2 size={13} />
            </button>

            {/* Executar removido — disparo é pelo botão DISPARAR SQUAD no header */}
          </div>
        </Panel>
      </ReactFlow>

        {/* Estado vazio — guia o usuário quando canvas está limpo */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
            <div className="text-center space-y-3 opacity-40">
              <Users size={48} className="mx-auto text-muted" />
              <p className="text-sm font-black uppercase tracking-widest text-muted">Selecione ou crie uma Squad</p>
              <p className="text-[10px] text-muted/60 font-mono max-w-sm leading-relaxed">
                Monte o seu time de agentes do jeito que quiser — cada um com sua função, soul e skills.
              </p>
            </div>
          </div>
        )}

        {/* Agent Panel Overlay */}
        {agentPanelNodeId && (
          <AgentPanelOverlay
            nodeId={agentPanelNodeId}
            nodes={nodes}
            setNodes={setNodes}
            onClose={() => setAgentPanelNodeId(null)}
          />
        )}

        {/* Industrial Overlay Decoration */}
        <div className="absolute top-4 left-4 pointer-events-none opacity-[0.03]">
          <div className="text-[40px] lg:text-[80px] font-black italic tracking-tighter text-foreground select-none uppercase">SQUAD</div>
        </div>
      </div>
    </WorkflowCanvasContext.Provider>
  );
}

type FlowBuilderProps = {
  workflow?: FlowBuilderWorkflow | null;
  onSaveDefinition?: (def: { nodes: Node[]; edges: Edge[] }) => void | Promise<void>;
  onRun?: () => void | Promise<void>;
};

export function FlowBuilder({ workflow, onSaveDefinition, onRun }: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowContent workflow={workflow} onSaveDefinition={onSaveDefinition} onRun={onRun} />
    </ReactFlowProvider>
  );
}
