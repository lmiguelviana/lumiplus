'use client';

import React, { useCallback, useState } from 'react';
import { Bot, Send, Loader2, Workflow, Zap, Trash2, X, Brain, BookOpen, Plus } from 'lucide-react';
import api from '@/lib/api';
import { FlowBuilder, type FlowBuilderWorkflow } from '@/components/workflow/flow-builder';
import { motion, AnimatePresence } from 'framer-motion';

export default function WorkflowsPage() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatLog, setChatLog] = useState<{ role: 'user' | 'system', content: string }[]>([
    { role: 'system', content: 'Olá! Sou o Lumi Architect. Descreva o fluxo que quer (ex: "receber PDF no WhatsApp, resumir com um agente e pedir aprovação"). Você também pode usar os botões ao lado para adicionar Funcionário IA, Aprovação ou Squad.' }
  ]);
  const [activeWorkflow, setActiveWorkflow] = useState<FlowBuilderWorkflow | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isToolboxOpen, setIsToolboxOpen] = useState(true);
  const [workflows, setWorkflows] = useState<any[]>([]);

  // Agents state (nova lógica: selecionar agente → ver squad + workflows)
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);

  // Squad state
  const [squads, setSquads] = useState<any[]>([]);
  const [activeSquad, setActiveSquad] = useState<any | null>(null);
  const [isCreatingSquad, setIsCreatingSquad] = useState(false);
  const [newSquadName, setNewSquadName] = useState('');

  // Employee management state
  const [squadMembers, setSquadMembers] = useState<any[]>([]);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  // Painel de memória da squad
  const [memoryModal, setMemoryModal] = useState(false);
  const [squadMemories, setSquadMemories] = useState<any[]>([]);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [memorySquadName, setMemorySquadName] = useState('');

  const handleViewMemory = async (squadId: string, squadName: string) => {
    setMemorySquadName(squadName);
    setMemoryModal(true);
    setSquadMemories([]);
    setIsLoadingMemory(true);
    try {
      const res = await api.get(`/squads/${squadId}/memory`);
      setSquadMemories(res.data.memories || []);
    } catch (err) {
      console.error('Erro ao carregar memória:', err);
    } finally {
      setIsLoadingMemory(false);
    }
  };

  // Squad trigger — objective prompt
  const [objectiveModal, setObjectiveModal] = useState(false);
  const [objectiveText, setObjectiveText] = useState('');
  const [isTriggeringSquad, setIsTriggeringSquad] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await api.get('/workflows');
      setWorkflows(res.data.workflows);
    } catch (err) {
      console.error('Erro ao carregar workflows:', err);
    }
  }, []);

  const fetchSquads = useCallback(async () => {
    try {
      const res = await api.get('/squads');
      setSquads(res.data.squads);
    } catch (err) {
      console.error('Erro ao carregar squads:', err);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/agents');
      const data = res.data;
      setAgents(Array.isArray(data) ? data : data.agents || []);
    } catch (err) {
      console.error('Erro ao carregar agentes:', err);
    }
  }, []);

  React.useEffect(() => {
    fetchWorkflows();
    fetchSquads();
    fetchAgents();
  }, [fetchWorkflows, fetchSquads, fetchAgents]);

  // Ao selecionar um agente, buscar sua squad
  const handleSelectAgent = async (agent: any) => {
    setSelectedAgent(agent);
    setActiveWorkflow(null);
    setActiveSquad(null);
    setSquadMembers([]);

    // Buscar squad do agente (onde ele é líder) — primeiro tenta nos dados já carregados
    let agentSquad = squads.find((s: any) =>
      s.members?.some((m: any) => m.agentId === agent.id && m.role === 'leader')
    );

    // Se não encontrou, recarrega do backend
    if (!agentSquad) {
      try {
        const res = await api.get('/squads');
        const freshSquads = res.data.squads || [];
        setSquads(freshSquads);
        agentSquad = freshSquads.find((s: any) =>
          s.members?.some((m: any) => m.agentId === agent.id && m.role === 'leader')
        );
      } catch (err) {
        console.error('Erro ao buscar squads:', err);
      }
    }

    if (agentSquad) {
      handleSelectSquad(agentSquad);
    }
  };

  // Ao selecionar um workflow da lista, carregar definition do backend (GET /workflows/:id)
  React.useEffect(() => {
    if (!activeWorkflow?.id || activeSquad) return;
    api.get(`/workflows/${activeWorkflow.id}`)
      .then((res) => {
        const w = res.data.workflow;
        if (w && activeWorkflow.id === w.id) setActiveWorkflow(w);
      })
      .catch(() => {});
  }, [activeWorkflow?.id]);

  // Ao selecionar uma squad, carregar canvas do backend
  const handleSelectSquad = async (squad: any) => {
    setActiveWorkflow(null);
    setActiveSquad({ ...squad, canvas: null });
    setIsAddingEmployee(false);
    try {
      const res = await api.get(`/squads/${squad.id}/canvas`);
      setActiveSquad({ ...squad, canvas: res.data.canvas });
      setSquadMembers(res.data.squad?.members || []);
    } catch (err) {
      console.error('Erro ao carregar canvas da squad:', err);
      setActiveSquad({ ...squad, canvas: { nodes: [], edges: [] } });
      setSquadMembers([]);
    }
  };

  // Cria uma nova squad
  const handleCreateSquad = async () => {
    if (!newSquadName.trim()) return;
    try {
      const res = await api.post('/squads', { name: newSquadName.trim() });
      const created = res.data.squad;
      setSquads(prev => [created, ...prev]);
      setNewSquadName('');
      setIsCreatingSquad(false);
      handleSelectSquad(created);
    } catch (err) {
      console.error('Erro ao criar squad:', err);
    }
  };

  // Deleta squad
  const handleDeleteSquad = async (e: React.MouseEvent, squadId: string) => {
    e.stopPropagation();
    if (!confirm('Excluir esta squad? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/squads/${squadId}`);
      setSquads(prev => prev.filter(s => s.id !== squadId));
      if (activeSquad?.id === squadId) {
        setActiveSquad(null);
        setSquadMembers([]);
      }
    } catch (err) {
      console.error('Erro ao excluir squad:', err);
    }
  };

  // Carrega membros da squad selecionada
  const fetchSquadMembers = useCallback(async (squadId: string) => {
    try {
      const res = await api.get(`/squads/${squadId}/canvas`);
      setSquadMembers(res.data.squad?.members || []);
    } catch {
      setSquadMembers([]);
    }
  }, []);

  // Abre modal de adicionar funcionário e busca agentes disponíveis
  const handleOpenAddEmployee = async () => {
    try {
      const res = await api.get('/dashboard/agents');
      const agentsData = res.data;
      const agents = Array.isArray(agentsData) ? agentsData : agentsData.agents || [];
      const memberIds = new Set(squadMembers.map((m: any) => m.agentId));
      setAvailableAgents(agents.filter((a: any) => !memberIds.has(a.id)));
      setSelectedAgentId('');
      setIsAddingEmployee(true);
    } catch (err) {
      console.error('Erro ao buscar agentes:', err);
    }
  };

  // Adiciona funcionário à squad
  const handleAddEmployee = async () => {
    if (!selectedAgentId || !activeSquad) return;
    try {
      await api.post(`/squads/${activeSquad.id}/employees`, { agentId: selectedAgentId });
      await fetchSquadMembers(activeSquad.id);
      setIsAddingEmployee(false);
      setSelectedAgentId('');
    } catch (err) {
      console.error('Erro ao adicionar funcionário:', err);
    }
  };

  // Remove funcionário da squad
  const handleRemoveEmployee = async (agentId: string) => {
    if (!activeSquad) return;
    try {
      await api.delete(`/squads/${activeSquad.id}/employees/${agentId}`);
      setSquadMembers(prev => prev.filter((m: any) => m.agentId !== agentId));
    } catch (err) {
      console.error('Erro ao remover funcionário:', err);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isLoading) return;

    const userMsg = prompt.trim();
    setPrompt('');
    setChatLog(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await api.post('/workflows/chat2workflow', { prompt: userMsg });
      const { workflow } = res.data;

      setActiveWorkflow(workflow);
      setActiveSquad(null);
      setChatLog(prev => [...prev, {
        role: 'system',
        content: `Mapeamento concluído! O workflow "${workflow.name}" foi projetado no canvas. Você pode arrastar os servidores e agentes para reorganizar como preferir.`
      }]);
    } catch (err: any) {
      setChatLog(prev => [...prev, {
        role: 'system',
        content: `❌ Ops, erro na arquitetura: ${err.response?.data?.error || err.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Resolve qual "workflow" passa para o FlowBuilder (squad ou workflow real)
  const flowWorkflow: FlowBuilderWorkflow | null = activeSquad
    ? { id: activeSquad.id, name: activeSquad.name, definition: activeSquad.canvas }
    : activeWorkflow;

  // Callback de save: squad → POST /squads/:id/canvas | workflow → PUT /workflows/:id
  const flowOnSave = activeSquad
    ? async (def: any) => {
        try {
          await api.post(`/squads/${activeSquad.id}/canvas`, { state: def });
        } catch (e) {
          console.error('Erro ao salvar canvas da squad:', e);
        }
      }
    : activeWorkflow?.id
      ? async (def: any) => {
          try {
            await api.put(`/workflows/${activeWorkflow.id}`, { definition: def });
          } catch (e) {
            console.error('Erro ao salvar canvas:', e);
          }
        }
      : undefined;

  // Trigger squad com objetivo
  const handleTriggerSquad = async () => {
    if (!activeSquad || isTriggeringSquad) return;
    setIsTriggeringSquad(true);
    try {
      const res = await api.post(`/squads/${activeSquad.id}/trigger`, {
        objective: objectiveText.trim() || undefined
      });
      setLastRunId(res.data.runId);
      setObjectiveModal(false);
      setObjectiveText('');
      console.log('[Squad] Run iniciado:', res.data.runId);
    } catch (e) {
      console.error('Erro ao disparar squad:', e);
    } finally {
      setIsTriggeringSquad(false);
    }
  };

  // Callback de run: squad → abre modal de objetivo | workflow → POST /workflows/:id/run
  const flowOnRun = activeSquad
    ? () => { setObjectiveModal(true); }
    : activeWorkflow?.id
      ? async () => {
          try {
            await api.post(`/workflows/${activeWorkflow.id}/run`, {});
          } catch (e) {
            console.error('Erro ao disparar workflow:', e);
          }
        }
      : undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -mt-4 lg:-mt-8 -mx-4 lg:-mx-8 overflow-hidden bg-background">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-2 px-6 pt-4 shrink-0">
        <div className="border-l-4 border-primary pl-4 py-1">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase italic text-foreground leading-none">
            Neural <span className="text-primary italic">Architect</span>
          </h1>
          <p className="text-muted font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1.5">
            Orquestração Visual de Agentes & Automação de Squads
          </p>
        </div>

        <div className="flex gap-2">
            <button
              onClick={() => setIsToolboxOpen(!isToolboxOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-[10px] border transition-all ${
                isToolboxOpen
                ? 'bg-surface text-foreground border-primary/50'
                : 'bg-surface text-muted border-border-strong hover:border-primary'
              }`}
            >
              <Workflow size={14} />
              {isToolboxOpen ? 'OCULTAR SIDEBAR' : 'MOSTRAR SIDEBAR'}
            </button>

            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-[10px] border transition-all ${
                isChatOpen
                ? 'bg-primary text-white border-primary shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]'
                : 'bg-surface text-foreground border-border-strong hover:border-primary'
              }`}
            >
              <Bot size={14} className={isChatOpen ? 'animate-pulse' : ''} />
              {isChatOpen ? 'FECHAR ARQUITETO' : 'LUMI ARCHITECT'}
            </button>

            {flowWorkflow && (
              <button
                onClick={flowOnRun}
                className="btn-accent py-2 px-5 text-[10px] shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)] border border-white/20"
              >
                {activeSquad ? 'DISPARAR SQUAD' : 'DEPLOY / RUN'}
              </button>
            )}
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 relative px-4 pb-0 overflow-hidden">
        {/* Left Sidebar: Toolbox & History */}
        <AnimatePresence>
          {isToolboxOpen && (
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="w-72 hidden xl:flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar shrink-0"
            >
              {/* LISTA DE AGENTES */}
              <div className="industrial-card p-5 space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted flex items-center gap-2">
                  <Bot className="w-3 h-3" /> Agentes
                </h3>
                <div className="space-y-2">
                  {agents.map(agent => (
                    <div
                      key={agent.id}
                      onClick={() => handleSelectAgent(agent)}
                      className={`p-3 border rounded-lg cursor-pointer transition-all group ${
                        selectedAgent?.id === agent.id
                          ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]'
                          : 'bg-surface border-border-strong hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black uppercase tracking-tighter text-foreground truncate">{agent.name}</span>
                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      </div>
                      <p className="text-[9px] text-muted truncate">{agent.mission || agent.model || 'Sem missão'}</p>
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <p className="text-[10px] text-muted italic text-center py-4">Nenhum agente criado ainda.</p>
                  )}
                </div>
              </div>

              {/* WORKFLOWS DO AGENTE */}
              {selectedAgent && (
                <div className="industrial-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-muted flex items-center gap-2">
                      <Workflow className="w-3 h-3" /> Workflows
                    </h3>
                    <button
                      onClick={async () => {
                        const name = `Workflow de ${selectedAgent.name} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                        try {
                          const res = await api.post('/workflows', {
                            name,
                            description: `Workflow do agente ${selectedAgent.name}`,
                            trigger: { type: 'manual' },
                            definition: { nodes: [], edges: [] },
                          });
                          const created = res.data.workflow;
                          setWorkflows(prev => [created, ...prev]);
                          setActiveWorkflow(created);
                          setActiveSquad(null);
                        } catch (err) {
                          console.error('Erro ao criar workflow:', err);
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-primary/10 border border-primary/30 rounded text-[9px] font-bold text-primary hover:bg-primary/20 transition-all"
                    >
                      <Plus size={10} /> Novo
                    </button>
                  </div>
                  <div className="space-y-2">
                    {workflows.map(wf => (
                      <div
                        key={wf.id}
                        onClick={() => { setActiveWorkflow(wf); setActiveSquad(null); }}
                        className={`p-2 border rounded-lg cursor-pointer transition-all text-[10px] group ${
                          activeWorkflow?.id === wf.id && !activeSquad
                            ? 'bg-primary/10 border-primary text-foreground'
                            : 'bg-surface border-border-weak hover:border-primary/40 text-muted hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold truncate">{wf.name}</span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Excluir workflow "${wf.name}"? Esta ação não pode ser desfeita.`)) return;
                              try {
                                await api.delete(`/workflows/${wf.id}`);
                                setWorkflows(prev => prev.filter(w => w.id !== wf.id));
                                if (activeWorkflow?.id === wf.id) setActiveWorkflow(null);
                              } catch (err) {
                                console.error('Erro ao excluir workflow:', err);
                              }
                            }}
                            className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                            title="Excluir workflow"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {workflows.length === 0 && (
                      <p className="text-[9px] text-muted italic">Nenhum workflow criado. Use o Lumi Architect para criar.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!selectedAgent && (
                <div className="industrial-card p-6 text-center">
                  <Bot className="w-10 h-10 text-muted/20 mx-auto mb-3" />
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Selecione um agente</p>
                  <p className="text-[9px] text-muted mt-1">para ver seus workflows</p>
                </div>
              )}

              <div className="industrial-card p-6 bg-primary/10 border-primary/20 mt-auto">
                 <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Sistema Operacional</span>
                 </div>
                 <p className="text-[10px] leading-relaxed text-muted uppercase font-bold">
                    Modo Zero-Redis Ativo. Orquestração em memória estável.
                 </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center: Main Canvas */}
        <div className="flex-1 min-w-0 min-h-0 bg-background rounded-xl border border-border-weak relative overflow-hidden">
          <div className="absolute inset-0">
            <FlowBuilder
              workflow={flowWorkflow}
              onSaveDefinition={flowOnSave}
              onRun={flowOnRun}
            />
          </div>
        </div>

        {/* Right Sidebar: AI Architect Panel */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-96 flex flex-col bg-surface border-l border-border-strong shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[100] shrink-0"
            >
               {/* AIA Header */}
               <div className="p-5 bg-primary text-white flex items-center justify-between border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded bg-white/10 border border-white/20">
                      <Bot size={20} />
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">System_Unit</div>
                      <div className="text-sm font-black italic tracking-tighter">LUMI_ARCHITECT</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  </div>
               </div>

               {/* AIA Chat Area */}
               <div className="flex-1 p-5 overflow-y-auto space-y-6 custom-scrollbar bg-background/20">
                  <AnimatePresence initial={false}>
                    {chatLog.map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[90%] p-4 text-[11px] font-bold leading-relaxed shadow-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-white rounded-l-2xl rounded-tr-2xl'
                            : 'bg-surface border border-border-strong text-foreground rounded-r-2xl rounded-tl-2xl'
                        }`}>
                          {msg.content}
                        </div>
                      </motion.div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-surface border border-border-strong p-3 rounded-2xl flex items-center gap-3 ring-1 ring-primary/20">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-[10px] font-black uppercase tracking-widest animate-pulse text-primary">Arquitetando Nós...</span>
                        </div>
                      </div>
                    )}
                  </AnimatePresence>
               </div>

               {/* AIA Input */}
               <form onSubmit={handleGenerate} className="p-5 border-t border-border-strong bg-surface/50">
                  <div className="relative">
                    <input
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Comando de Orquestração..."
                      className="w-full bg-background border-2 border-border-strong rounded-xl pl-4 pr-12 py-3.5 text-xs font-bold focus:outline-none focus:border-primary transition-all text-foreground placeholder:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-primary hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-2">
                     <div className="h-[1px] flex-1 bg-border-strong" />
                     <span className="text-[8px] font-black uppercase tracking-widest text-muted/50 whitespace-nowrap">Neural Architect Engine v2.5</span>
                     <div className="h-[1px] flex-1 bg-border-strong" />
                  </div>
               </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal — Memória da Squad */}
      <AnimatePresence>
        {memoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setMemoryModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-2xl bg-surface border border-border-strong rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
            >
              <div className="p-5 bg-purple-600 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Brain size={18} />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-70">Squad Memory</div>
                    <div className="text-base font-black italic tracking-tighter mt-0.5">{memorySquadName}</div>
                  </div>
                </div>
                <button onClick={() => setMemoryModal(false)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
                {isLoadingMemory ? (
                  <div className="flex items-center justify-center py-12 gap-3">
                    <Loader2 size={16} className="animate-spin text-purple-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">Carregando memórias...</span>
                  </div>
                ) : squadMemories.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="w-10 h-10 text-muted/30 mx-auto mb-3" />
                    <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Nenhuma memória ainda.</p>
                    <p className="text-[10px] text-muted/60 mt-1">Execute a squad com um objetivo para começar a aprender.</p>
                  </div>
                ) : (
                  squadMemories.map((mem: any, i: number) => (
                    <div key={mem.id || i} className="p-4 bg-background border border-border-weak rounded-xl space-y-2 hover:border-purple-500/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">{mem.title || 'Memória'}</span>
                        <span className="text-[9px] text-muted font-mono">
                          {mem.created_at ? new Date(mem.created_at).toLocaleDateString('pt-BR') : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed line-clamp-4 font-medium whitespace-pre-wrap">
                        {mem.content}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-border-strong shrink-0">
                <p className="text-[9px] text-muted text-center uppercase tracking-widest font-bold">
                  {squadMemories.length} memória(s) · Geradas automaticamente após cada execução
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal — Objetivo da Squad */}
      <AnimatePresence>
        {objectiveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setObjectiveModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-surface border border-border-strong rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 bg-primary text-white flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-70">Squad Execution</div>
                  <div className="text-base font-black italic tracking-tighter mt-0.5">
                    {activeSquad?.name}
                  </div>
                </div>
                <button onClick={() => setObjectiveModal(false)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted mb-2 block">Objetivo da Execução</label>
                  <textarea
                    autoFocus
                    value={objectiveText}
                    onChange={e => setObjectiveText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleTriggerSquad(); }}
                    placeholder={`Ex: "Pesquise as últimas tendências de IA e crie um relatório em português."`}
                    className="w-full bg-background border border-border-strong rounded-xl p-3 text-xs font-bold text-foreground outline-none focus:border-primary resize-none h-28 leading-relaxed"
                  />
                  <p className="text-[9px] text-muted mt-1">Ctrl+Enter para disparar. Deixe vazio para usar a missão padrão da squad.</p>
                </div>

                {lastRunId && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-[10px] font-bold text-green-400">Run ID: {lastRunId}</p>
                    <p className="text-[9px] text-muted mt-0.5">Squad em execução. Acompanhe o status no canvas.</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setObjectiveModal(false)}
                    className="flex-1 py-3 bg-surface border border-border-strong rounded-xl text-[10px] font-black uppercase tracking-widest text-muted hover:border-primary/40 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleTriggerSquad}
                    disabled={isTriggeringSquad}
                    className="flex-1 py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {isTriggeringSquad ? (
                      <><Loader2 size={12} className="animate-spin" /> Disparando...</>
                    ) : (
                      <><Zap size={12} /> Disparar Squad</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
