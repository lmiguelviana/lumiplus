'use client';

import React, { useState, useEffect } from 'react';
import {
  Share2,
  MessageSquare,
  Send,
  Smartphone,
  Globe,
  Activity,
  Settings2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { ConnectorModal } from '@/components/ConnectorModal';

interface ChannelStatus {
  type: string;
  status: string;
  configuredAt: string | null;
}

interface AgentWithChannels {
  id: string;
  name: string;
  slug: string;
  status: string;
  channels: ChannelStatus[];
}

export default function ChannelsPage() {
  const [agents, setAgents] = useState<AgentWithChannels[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<{agentId: string, agentName: string, type: 'whatsapp' | 'telegram'} | null>(null);

  const loadAgents = async () => {
    try {
      const response = await api.get('/dashboard/agents');
      const agentsRaw = response.data;

      // Buscar canais de cada agente em paralelo
      const withChannels = await Promise.all(
        agentsRaw.map(async (agent: any) => {
          try {
            const chRes = await api.get(`/channels/${agent.id}`);
            return { ...agent, channels: chRes.data.channels || [] };
          } catch {
            return {
              ...agent,
              channels: [
                { type: 'whatsapp', status: 'inactive', configuredAt: null },
                { type: 'telegram', status: 'inactive', configuredAt: null },
                { type: 'webchat', status: 'active', configuredAt: null },
              ]
            };
          }
        })
      );

      setAgents(withChannels);
    } catch (error) {
      console.error('Erro ao buscar agentes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAgents(); }, []);

  const getChannelStatus = (channels: ChannelStatus[], type: string) => {
    return channels.find(c => c.type === type)?.status === 'active';
  };

  const handleDisconnect = async (agentId: string, type: string) => {
    if (!confirm(`Desconectar ${type} deste agente?`)) return;
    try {
      await api.delete(`/channels/${agentId}/${type}`);
      await loadAgents();
    } catch {
      alert('Erro ao desconectar canal');
    }
  };

  const handleModalClose = () => {
    setSelectedAgent(null);
    loadAgents(); // Recarrega para refletir novo status
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-1 bg-primary animate-pulse" />
        <p className="font-black uppercase tracking-[0.2em] text-xs opacity-50">Sincronizando Canais...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-l-4 border-primary pl-6 py-2">
        <div>
          <h2 className="text-5xl font-black tracking-tighter uppercase italic">
            Canais <span className="text-primary italic">Connect</span>
          </h2>
          <p className="text-muted font-bold uppercase tracking-widest text-xs mt-2">
            Cada agente tem suas próprias contas — configure WhatsApp e Telegram individualmente
          </p>
        </div>
      </section>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {agents.map((agent) => {
          const waActive = getChannelStatus(agent.channels, 'whatsapp');
          const tgActive = getChannelStatus(agent.channels, 'telegram');

          return (
            <div key={agent.id} className="industrial-card p-0 overflow-hidden flex flex-col">
              {/* Agent Header */}
              <div className="p-6 border-b border-border-strong bg-[var(--surface)] flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 text-primary">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight">{agent.name}</h3>
                    <p className="text-[10px] font-bold text-muted uppercase">@{agent.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-black uppercase",
                    waActive || tgActive ? "text-green-500" : "text-muted"
                  )}>
                    {waActive || tgActive
                      ? `${[waActive && 'WA', tgActive && 'TG'].filter(Boolean).join(' + ')} Ativo`
                      : 'Nenhum canal'}
                  </span>
                  <div className={cn("w-2 h-2", waActive || tgActive ? "bg-green-500" : "bg-muted")} />
                </div>
              </div>

              {/* Channels Grid */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--surface)]/30">
                {/* WhatsApp */}
                <div className="flex flex-col gap-4 p-4 border border-border-strong bg-background/50 group hover:border-green-500/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <Smartphone className="w-6 h-6 text-green-500" />
                    <div className={cn("w-2 h-2 rounded-full", waActive ? "bg-green-500" : "bg-muted")} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">WhatsApp</p>
                    <p className="text-[10px] font-bold text-muted uppercase opacity-50">
                      {waActive ? 'Conta conectada' : 'Não configurado'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedAgent({ agentId: agent.id, agentName: agent.name, type: 'whatsapp' })}
                      className={cn(
                        "flex-1 py-2 font-black text-[10px] uppercase border transition-all text-center",
                        waActive
                          ? "bg-green-500/10 text-green-500 border-green-500/20"
                          : "bg-[var(--surface)] text-foreground border-border-strong hover:bg-primary hover:text-white hover:border-primary"
                      )}
                    >
                      {waActive ? 'Reconectar' : 'Configurar'}
                    </button>
                    {waActive && (
                      <button
                        onClick={() => handleDisconnect(agent.id, 'whatsapp')}
                        className="py-2 px-3 border border-border-strong hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                        title="Desconectar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Telegram */}
                <div className="flex flex-col gap-4 p-4 border border-border-strong bg-background/50 group hover:border-blue-500/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <Send className="w-6 h-6 text-blue-500" />
                    <div className={cn("w-2 h-2 rounded-full", tgActive ? "bg-green-500" : "bg-muted")} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">Telegram</p>
                    <p className="text-[10px] font-bold text-muted uppercase opacity-50">
                      {tgActive ? 'Bot conectado' : 'Não configurado'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedAgent({ agentId: agent.id, agentName: agent.name, type: 'telegram' })}
                      className={cn(
                        "flex-1 py-2 font-black text-[10px] uppercase border transition-all text-center",
                        tgActive
                          ? "bg-green-500/10 text-green-500 border-green-500/20"
                          : "bg-[var(--surface)] text-foreground border-border-strong hover:bg-primary hover:text-white hover:border-primary"
                      )}
                    >
                      {tgActive ? 'Reconectar' : 'Configurar'}
                    </button>
                    {tgActive && (
                      <button
                        onClick={() => handleDisconnect(agent.id, 'telegram')}
                        className="py-2 px-3 border border-border-strong hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                        title="Desconectar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Web Chat */}
                <div className="flex flex-col gap-4 p-4 border border-border-strong bg-background/50 group hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <Globe className="w-6 h-6 text-primary" />
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">Web Chat</p>
                    <p className="text-[10px] font-bold text-muted uppercase opacity-50">Sempre ativo</p>
                  </div>
                  <div className="w-full py-2 bg-green-500/10 text-green-500 text-center font-black text-[10px] uppercase border border-green-500/20">
                    Pronto
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connector Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <ConnectorModal
            agentId={selectedAgent.agentId}
            type={selectedAgent.type}
            onClose={handleModalClose}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
