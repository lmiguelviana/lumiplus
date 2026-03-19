'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  MessageSquare,
  Loader2,
  Image as ImageIcon,
  X,
  ThumbsUp,
  ThumbsDown,
  Users,
  Brain,
  Zap,
  Mic,
  MicOff,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface ChatButton {
  label: string;
  type: 'reply' | 'url' | 'callback';
  value: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  interactionId?: string;
  rating?: 'positive' | 'negative';
  isSquadOutput?: boolean;
  buttons?: ChatButton[];
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  soul: string;
}

interface Squad {
  id: string;
  name: string;
  description?: string;
}

const SQUAD_HELP = `⚡ **Comandos disponíveis:**
\`/squad usar [nome]\` — ativa uma squad no chat
\`/squad status\` — mostra a squad ativa
\`/squad memoria\` — exibe o que a squad aprendeu
\`/squad reset\` — desativa a squad e volta ao agente normal
\`/squad lista\` — lista todas as squads disponíveis

Quando uma squad está ativa, cada mensagem vira um **objetivo** e a squad executa automaticamente.`;

interface Conversation {
  id: string;
  channel: string;
  lastMessage: string;
  lastRole: string;
  lastAt: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [slashCommands, setSlashCommands] = useState<{full: string; desc: string}[]>([]);
  const [slashIdx, setSlashIdx] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSquad, setActiveSquad] = useState<Squad | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) return; // muito curto

        // Converter para base64 e enviar
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];

        try {
          setIsTyping(true);
          setMessages(prev => [...prev, { role: 'user', content: '🎤 [Mensagem de voz]' }]);
          const res = await api.post('/ai/transcribe', {
            audio: base64,
            agentId: selectedAgent?.id || selectedAgent,
          });
          const transcript = res.data?.text || res.data?.transcript || '';
          if (transcript) {
            // Atualiza a mensagem do user com o texto real
            setMessages(prev => {
              const updated = [...prev];
              const lastUserIdx = updated.findLastIndex(m => m.role === 'user');
              if (lastUserIdx >= 0) updated[lastUserIdx].content = `🎤 ${transcript}`;
              return updated;
            });
            // Envia o texto transcrito para o agente
            const aiRes = await api.post('/ai/chat', {
              agentId: selectedAgent?.id || selectedAgent,
              messages: [{ role: 'user', content: transcript }],
              conversationId: activeConversationId,
            });
            const aiContent = aiRes.data.content || aiRes.data.response || 'Sem resposta';
            setMessages(prev => [...prev, { role: 'assistant', content: aiContent, interactionId: aiRes.data.interactionId }]);
            if (aiRes.data.conversationId) setActiveConversationId(aiRes.data.conversationId);
          }
        } catch (err: any) {
          const errMsg = err?.response?.data?.error || err?.message || 'Erro desconhecido';
          console.error('[Audio] Erro:', errMsg, err);
          setMessages(prev => [...prev, { role: 'assistant', content: `Erro ao transcrever: ${errMsg}` }]);
        } finally {
          setIsTyping(false);
        }
        }; // end reader.onloadend
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingTime(0);
  };

  // Conversas
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<string>('web');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const response = await api.get('/dashboard/agents');
        setAgents(response.data);
        if (response.data.length > 0) {
          setSelectedAgent(response.data[0]);
        }
      } catch (error) {
        console.error('Erro ao buscar agentes:', error);
      }
    }
    fetchAgents();
  }, []);

  // Carregar conversas ao trocar de agente — SEMPRE limpa o estado primeiro
  useEffect(() => {
    if (!selectedAgent) return;

    // Reset COMPLETO ao trocar de agente — garante isolamento total das conversas
    setMessages([]);
    setActiveConversationId(null);
    setActiveSquad(null);
    setActiveChannel('web');

    api.get(`/ai/conversations/${selectedAgent.id}`)
      .then(async (res) => {
        const convs = res.data || [];
        setConversations(convs);
        // Carregar última conversa automaticamente se existir
        if (convs.length > 0) {
          const lastConv = convs[0]; // mais recente
          try {
            const msgRes = await api.get(`/ai/conversations/${selectedAgent.id}/${lastConv.id}/messages`);
            const msgs: Message[] = (msgRes.data || []).map((m: any) => ({
              role: m.role,
              content: m.content,
            }));
            if (msgs.length > 0) {
              setMessages(msgs);
              setActiveConversationId(lastConv.id);
              setActiveChannel(lastConv.channel || 'web');
            }
          } catch {}
        }
      })
      .catch(() => setConversations([]));
  }, [selectedAgent?.id]);

  const loadConversation = async (convId: string) => {
    if (!selectedAgent) return;
    try {
      const res = await api.get(`/ai/conversations/${selectedAgent.id}/${convId}/messages`);
      const msgs: Message[] = (res.data || []).map((m: any) => ({
        role: m.role,
        content: m.content,
      }));
      setMessages(msgs);
      setActiveConversationId(convId);
      const conv = conversations.find(c => c.id === convId);
      setActiveChannel(conv?.channel || 'web');
      setShowHistory(false);
    } catch {
      console.error('Erro ao carregar conversa');
    }
  };

  const startNewConversation = async () => {
    if (!selectedAgent) return;
    // Limpa o estado imediatamente, sem esperar o backend
    setMessages([]);
    setActiveConversationId(null);
    setActiveSquad(null);
    setShowHistory(false);
    try {
      const res = await api.post(`/ai/conversations/${selectedAgent.id}`);
      setActiveConversationId(res.data.id);
      setActiveChannel('web');
      // Recarrega lista
      const list = await api.get(`/ai/conversations/${selectedAgent.id}`);
      setConversations(list.data || []);
    } catch {
      // Fallback já feito acima (estado limpo)
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isAnalyzing]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRating = async (interactionId: string, rating: 'positive' | 'negative', msgIdx: number) => {
    try {
      await api.patch(`/ai/interactions/${interactionId}/rating`, { rating });
      setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, rating } : m));
    } catch (e) {
      console.error('Erro ao avaliar resposta:', e);
    }
  };

  const addSystemMsg = (content: string) =>
    setMessages(prev => [...prev, { role: 'system', content }]);

  const handleSquadCommand = async (cmd: string): Promise<boolean> => {
    const parts = cmd.trim().split(/\s+/);
    if (parts[0] !== '/squad') return false;

    const sub = parts[1]?.toLowerCase();
    setMessages(prev => [...prev, { role: 'user', content: cmd }]);

    if (!sub || sub === 'help') {
      addSystemMsg(SQUAD_HELP);
      return true;
    }

    if (sub === 'lista') {
      try {
        const res = await api.get('/squads');
        const squads: Squad[] = res.data.squads || [];
        if (squads.length === 0) {
          addSystemMsg('Nenhuma squad encontrada. Crie uma em Neural Architect → aba Squads.');
        } else {
          addSystemMsg(`📋 **Squads disponíveis:**\n${squads.map(s => `• ${s.name} (${s.id.slice(0,8)})`).join('\n')}\n\nUse \`/squad usar [nome]\` para ativar.`);
        }
      } catch {
        addSystemMsg('Erro ao listar squads.');
      }
      return true;
    }

    if (sub === 'usar') {
      const name = parts.slice(2).join(' ');
      if (!name) { addSystemMsg('Use: `/squad usar [nome da squad]`'); return true; }
      try {
        const res = await api.get('/squads');
        const squads: Squad[] = res.data.squads || [];
        const found = squads.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
        if (!found) {
          addSystemMsg(`Squad "${name}" não encontrada. Use \`/squad lista\` para ver as disponíveis.`);
        } else {
          setActiveSquad(found);
          addSystemMsg(`✅ Squad **${found.name}** ativada! Agora cada mensagem vira um objetivo para a squad. Use \`/squad reset\` para desativar.`);
        }
      } catch {
        addSystemMsg('Erro ao buscar squads.');
      }
      return true;
    }

    if (sub === 'status') {
      if (!activeSquad) {
        addSystemMsg('Nenhuma squad ativa. Use `/squad usar [nome]` para ativar uma.');
      } else {
        addSystemMsg(`🟢 Squad ativa: **${activeSquad.name}**\nID: \`${activeSquad.id}\`\nCada mensagem será enviada como objetivo da squad.`);
      }
      return true;
    }

    if (sub === 'reset') {
      setActiveSquad(null);
      addSystemMsg('Squad desativada. Voltando ao agente normal.');
      return true;
    }

    if (sub === 'memoria') {
      const squad = activeSquad;
      if (!squad) { addSystemMsg('Nenhuma squad ativa. Use `/squad usar [nome]` primeiro.'); return true; }
      setIsTyping(true);
      try {
        const res = await api.get(`/squads/${squad.id}/memory`);
        const memories = res.data.memories || [];
        if (memories.length === 0) {
          addSystemMsg(`A squad **${squad.name}** ainda não tem memórias. Execute-a com um objetivo primeiro.`);
        } else {
          const preview = memories.slice(0, 3).map((m: any) =>
            `📌 **${m.title}**\n${m.content?.slice(0, 300)}${m.content?.length > 300 ? '...' : ''}`
          ).join('\n\n---\n\n');
          addSystemMsg(`🧠 **Memória da Squad ${squad.name}** (${memories.length} registros):\n\n${preview}`);
        }
      } catch {
        addSystemMsg('Erro ao carregar memórias.');
      } finally {
        setIsTyping(false);
      }
      return true;
    }

    if (sub === 'info') {
      const squad = activeSquad;
      if (!squad) { addSystemMsg('Nenhuma squad ativa. Use `/squad usar [nome]` primeiro.'); return true; }
      try {
        const res = await api.get(`/squads/${squad.id}/canvas`);
        const members = res.data.squad.members || [];
        const names = members.map((m: any) => `• ${m.agent.name} (${m.role})`).join('\n');
        addSystemMsg(`ℹ️ **Informações da Squad: ${squad.name}**\n\n**Descrição:** ${squad.description || 'Sem descrição'}\n\n**Membros:**\n${names}`);
      } catch {
        addSystemMsg('Erro ao buscar informações da squad.');
      }
      return true;
    }

    if (sub === 'exec') {
      const squad = activeSquad;
      if (!squad) { addSystemMsg('Nenhuma squad ativa. Use `/squad usar [nome]` primeiro.'); return true; }
      const obj = parts.slice(2).join(' ');
      if (!obj) { addSystemMsg('Use: `/squad exec [objetivo da missão]`'); return true; }
      handleSend(); // Chama o send normal (que detecta activeSquad e envia como objetivo)
      return true;
    }

    addSystemMsg(`Comando desconhecido: \`${cmd}\`. Digite \`/squad\` para ver os comandos disponíveis.`);
    return true;
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !preview) || !selectedAgent || isTyping || isAnalyzing) return;

    const rawInput = input.trim();
    setInput('');

    // Intercepta comandos /squad
    if (rawInput.startsWith('/squad')) {
      await handleSquadCommand(rawInput);
      return;
    }

    let finalInput = rawInput;
    const userMessage: Message = { role: 'user', content: rawInput || 'Enviou uma imagem para análise.' };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      // 1. Análise Visual (se houver preview)
      if (preview) {
        setIsAnalyzing(true);
        try {
          const mimeType = preview.split(';')[0].split(':')[1];
          const base64 = preview.split(',')[1];
          const visionRes = await api.post('/ai/vision', { imageBase64: base64, mimeType });
          finalInput = `[CONTEXTO VISUAL: O usuário enviou uma imagem que o sistema analisou: ${visionRes.data.description}]\n\n${rawInput}`;
          setPreview(null);
        } catch (visionErr) {
          console.error('Vision Error:', visionErr);
        } finally {
          setIsAnalyzing(false);
        }
      }

      // 2a. Squad ativa — envia como objetivo para a squad
      if (activeSquad) {
        const res = await api.post(`/squads/${activeSquad.id}/trigger`, { objective: finalInput });
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚡ Squad **${activeSquad.name}** iniciada!\n\nRun ID: \`${res.data.runId}\`\nObjetivo: ${finalInput}\n\nA squad está executando. Os agentes vão colaborar e o resultado será salvo na memória. Use \`/squad memoria\` para ver o aprendizado após a execução.`,
          isSquadOutput: true
        }]);
        return;
      }

      // 2b. Chat normal com agente
      // Filtra apenas mensagens user/assistant para a IA (exclui 'system' que são avisos de UI)
      const chatHistory = [...messages, { role: 'user', content: finalInput }]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await api.post('/ai/chat', {
        messages: chatHistory,
        agentId: selectedAgent.id,
        conversationId: activeConversationId || undefined,
      });

      // Texto limpo (sem marcação [[buttons]]) + botões parseados
      const displayContent = response.data.text || response.data.content;

      // Salva o conversationId retornado pelo servidor (importante para a 1ª mensagem)
      if (response.data.conversationId && !activeConversationId) {
        setActiveConversationId(response.data.conversationId);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: displayContent,
        interactionId: response.data.interactionId,
        buttons: response.data.buttons,
      }]);
    } catch (error) {
      console.error('Erro no chat:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ [ERRO DE PROTOCOLO]: Falha na comunicação com o núcleo de inteligência.'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)]">

      {/* Sidebar de conversas */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-border-strong bg-surface flex flex-col overflow-hidden shrink-0"
          >
            <div className="p-3 border-b border-border-strong flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest">Conversas</span>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-foreground/5 rounded">
                <X size={14} />
              </button>
            </div>
            <button
              onClick={startNewConversation}
              className="m-2 p-2 border border-dashed border-primary/40 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-all flex items-center justify-center gap-2 rounded"
            >
              <MessageSquare size={12} /> Nova Conversa
            </button>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-[10px] text-muted text-center py-6 uppercase tracking-widest">Nenhuma conversa</p>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={cn(
                      "w-full p-3 text-left border-b border-border-strong/30 hover:bg-foreground/5 transition-all",
                      activeConversationId === conv.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {conv.channel === 'whatsapp' && <span className="text-[8px]">📱</span>}
                      {conv.channel === 'telegram' && <span className="text-[8px]">✈️</span>}
                      {conv.channel === 'web' && <span className="text-[8px]">🌐</span>}
                      {!conv.channel && <span className="text-[8px]">💬</span>}
                      <span className="text-[9px] font-black uppercase tracking-tight text-primary">
                        {conv.channel || 'web'}
                      </span>
                      <span className="text-[8px] text-muted ml-auto">
                        {new Date(conv.lastAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted truncate leading-relaxed">
                      {conv.lastMessage || 'Conversa vazia'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Chat Header */}
      <div className="industrial-card p-4 flex items-center justify-between mb-0 border-b-2 border-primary rounded-none">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "w-10 h-10 flex items-center justify-center border transition-all",
              showHistory ? "bg-primary text-white border-primary" : "bg-primary/10 border-primary hover:bg-primary/20"
            )}
            title="Histórico de conversas"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tighter">Terminal de IA</h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 animate-pulse" />
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">
                {activeChannel === 'telegram' ? '✈️ Conversa do Telegram' :
                 activeChannel === 'whatsapp' ? '📱 Conversa do WhatsApp' :
                 'Interface de Orquestração Direta'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeSquad ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/40 rounded-lg">
              <Users className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">{activeSquad.name}</span>
              <button
                onClick={() => setActiveSquad(null)}
                className="text-purple-400/60 hover:text-purple-400 transition-colors ml-1"
                title="Desativar squad"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5",
                  showHistory ? "bg-primary text-white border-primary" : "border-border-strong hover:border-primary text-muted hover:text-primary"
                )}
              >
                <MessageSquare size={12} /> Histórico
              </button>
              <button
                onClick={startNewConversation}
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-primary/40 text-primary hover:bg-primary hover:text-white transition-all flex items-center gap-1.5"
              >
                + Nova
              </button>
              <p className="text-[10px] font-black uppercase text-muted">CÉREBRO:</p>
              <select
                className="bg-surface border border-border-strong px-3 py-1.5 text-xs font-bold uppercase tracking-wider outline-none focus:border-primary transition-colors"
                value={selectedAgent?.id || ''}
                onChange={(e) => setSelectedAgent(agents.find(a => a.id === e.target.value) || null)}
              >
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-6 px-4 py-8 mb-4 border border-border-strong bg-surface/30 industrial-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
            <MessageSquare className="w-16 h-16 mb-4" />
            <h3 className="text-xl font-black uppercase tracking-tighter italic">Nenhuma transmissão iniciada</h3>
            <p className="text-xs font-bold uppercase tracking-widest mt-2">Selecione um agente e envie um comando.</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-60">Dica: digite <code>/squad</code> para ativar uma squad</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const isSystem = msg.role === 'system';
            const isSquad = msg.isSquadOutput;
            return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col max-w-[85%]",
                msg.role === 'user' ? "ml-auto items-end" : isSystem ? "mx-auto items-center w-full max-w-full" : "mr-auto items-start"
              )}
            >
              {!isSystem && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">
                    {msg.role === 'user' ? 'OPERADOR' : isSquad ? '⚡ SQUAD' : selectedAgent?.name}
                  </span>
                  <div className={cn("w-1 h-1", msg.role === 'user' ? "bg-foreground" : isSquad ? "bg-purple-400" : "bg-primary")} />
                </div>
              )}
              <div className={cn(
                "font-medium text-sm leading-relaxed whitespace-pre-wrap",
                isSystem
                  ? "w-full p-3 bg-foreground/5 border border-border-weak rounded-lg text-[11px] text-muted"
                  : isSquad
                  ? "p-4 border border-purple-500/40 bg-purple-500/5 text-foreground shadow-[4px_4px_0px_rgba(168,85,247,0.2)]"
                  : msg.role === 'user'
                  ? "p-4 border bg-foreground text-background border-border-strong shadow-[4px_4px_0px_var(--border-strong)]"
                  : "p-4 border bg-surface border-primary text-foreground shadow-[4px_4px_0px_var(--primary)]"
              )}>
                {msg.content}
              </div>
              {/* Inline buttons */}
              {msg.buttons && msg.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.buttons.map((btn: ChatButton, bi: number) => (
                    btn.type === 'url' ? (
                      <a
                        key={bi}
                        href={btn.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 text-[11px] font-black uppercase tracking-wider border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all cursor-pointer"
                      >
                        {btn.label}
                      </a>
                    ) : (
                      <button
                        key={bi}
                        onClick={async () => {
                          if (!selectedAgent || isTyping) return;
                          const btnText = btn.value;
                          setMessages(prev => [...prev, { role: 'user', content: btnText }]);
                          try {
                            setIsTyping(true);
                            const chatHistory = [...messages, { role: 'user' as const, content: btnText }];
                            const res = await api.post('/ai/chat', {
                              messages: chatHistory,
                              agentId: selectedAgent.id,
                              conversationId: activeConversationId || undefined,
                            });
                            const displayContent = res.data.text || res.data.content;
                            setMessages(prev => [...prev, { role: 'assistant', content: displayContent, buttons: res.data.buttons, interactionId: res.data.interactionId }]);
                          } catch { setMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao processar.' }]); }
                          finally { setIsTyping(false); }
                        }}
                        className="px-4 py-2 text-[11px] font-black uppercase tracking-wider border-2 border-primary/60 text-primary hover:bg-primary hover:text-white transition-all"
                      >
                        {btn.label}
                      </button>
                    )
                  ))}
                </div>
              )}
              {/* Rating buttons for assistant messages */}
              {msg.role === 'assistant' && msg.interactionId && (
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={() => msg.rating !== 'positive' && handleRating(msg.interactionId!, 'positive', idx)}
                    className={cn(
                      "p-1.5 border transition-all",
                      msg.rating === 'positive'
                        ? "bg-green-500/20 border-green-500/50 text-green-400"
                        : "border-border-strong text-muted hover:border-green-500/50 hover:text-green-400"
                    )}
                    title="Resposta útil"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => msg.rating !== 'negative' && handleRating(msg.interactionId!, 'negative', idx)}
                    className={cn(
                      "p-1.5 border transition-all",
                      msg.rating === 'negative'
                        ? "bg-red-500/20 border-red-500/50 text-red-400"
                        : "border-border-strong text-muted hover:border-red-500/50 hover:text-red-400"
                    )}
                    title="Resposta ruim"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </motion.div>
            );
          })}
        </AnimatePresence>

        {isTyping && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 text-primary"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">
              {isAnalyzing ? 'Analisando Imagem...' : 'Processando Inteligência...'}
            </span>
          </motion.div>
        )}
      </div>

      {/* Preview Area */}
      {preview && (
        <div className="mb-4 relative w-32 h-32 border-2 border-primary group">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          <button 
            onClick={() => setPreview(null)}
            className="absolute -top-2 -right-2 bg-primary text-white p-1 hover:bg-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSend} className="relative flex gap-4">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-industrial px-4 flex items-center justify-center border-2 border-border-strong hover:border-primary group"
          disabled={isTyping || isAnalyzing}
        >
          <ImageIcon className="w-5 h-5 text-muted group-hover:text-primary transition-colors" />
        </button>
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Navegar no autocomplete com setas
              if (input.startsWith('/') && slashCommands.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, slashCommands.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); }
                if (e.key === 'Tab' || (e.key === 'Enter' && slashCommands.length > 0 && input !== slashCommands[slashIdx]?.full)) {
                  e.preventDefault();
                  setInput(slashCommands[slashIdx].full + ' ');
                }
              }
            }}
            placeholder={activeSquad ? `OBJETIVO PARA SQUAD ${activeSquad.name.toUpperCase()}...` : "DIGITE / PARA VER COMANDOS..."}
            className="w-full bg-surface border-2 border-border-strong p-4 text-sm font-bold uppercase tracking-wider outline-none focus:border-primary transition-all placeholder:opacity-30"
            disabled={isTyping}
          />

          {/* Autocomplete de comandos / */}
          {input.startsWith('/') && (() => {
            const COMMANDS = [
              { full: '/squad usar', desc: 'Ativar uma squad' },
              { full: '/squad lista', desc: 'Listar squads disponíveis' },
              { full: '/squad info', desc: 'Informações da squad ativa' },
              { full: '/squad exec', desc: 'Executar missão da squad' },
              { full: '/squad status', desc: 'Status da squad ativa' },
              { full: '/squad memoria', desc: 'Memórias da squad' },
              { full: '/squad reset', desc: 'Desativar squad do chat' },
              { full: '/limpar', desc: 'Limpar histórico do chat' },
              { full: '/ajuda', desc: 'Lista de comandos' },
            ];
            const query = input.toLowerCase();
            const filtered = COMMANDS.filter(c => c.full.startsWith(query) || c.full.includes(query));
            if (filtered.length === 0 || input === filtered[0]?.full + ' ') return null;
            // Atualiza slashCommands para navegação
            if (JSON.stringify(filtered) !== JSON.stringify(slashCommands)) {
              setTimeout(() => { setSlashCommands(filtered); setSlashIdx(0); }, 0);
            }
            return (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border-2 border-primary rounded-lg shadow-2xl overflow-hidden z-50">
                {filtered.map((cmd, i) => (
                  <button
                    key={cmd.full}
                    type="button"
                    onClick={() => { setInput(cmd.full + ' '); setSlashCommands([]); }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2.5 text-left transition-all",
                      i === slashIdx ? "bg-primary/10 text-primary" : "hover:bg-foreground/5"
                    )}
                  >
                    <span className="text-xs font-black uppercase tracking-tight">{cmd.full}</span>
                    <span className="text-[9px] text-muted font-bold uppercase tracking-widest">{cmd.desc}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
        {/* Mic button */}
        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="px-4 flex items-center justify-center gap-2 border-2 border-red-500 bg-red-500/10 text-red-500 min-w-[120px]"
          >
            {/* Waveform animation */}
            <div className="flex items-center gap-[2px] h-5">
              {[1,2,3,4,5,4,3,2,1].map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] bg-red-500 rounded-full"
                  style={{
                    animation: `waveform 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                    height: `${h * 4}px`,
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] font-black tabular-nums">{recordingTime}s</span>
            <Square className="w-3 h-3 fill-current" />
            <style jsx>{`
              @keyframes waveform {
                0% { height: 4px; }
                100% { height: 18px; }
              }
            `}</style>
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={isTyping}
            className="px-4 flex items-center justify-center border-2 border-border-strong hover:border-primary text-muted hover:text-primary transition-all disabled:opacity-30"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
        <button
          type="submit"
          disabled={!input.trim() || isTyping}
          className="btn-accent px-8 flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
        >
          <span className="hidden sm:inline">EXECUTAR</span>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
    </div>
  );
}
