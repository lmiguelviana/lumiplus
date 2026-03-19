'use client';

import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  MessageCircle, 
  Activity,
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  Cpu,
  Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface TimeSeriesPoint {
  label: string;
  interactions: number;
  tokens: number;
  avgLatency: number;
}

interface SystemStatus {
  whatsapp: { status: string; count: number };
  telegram: { status: string; count: number };
  openrouter: { status: string; configured: boolean };
  pgvector: { status: string; count: number };
}

export default function DashboardHome() {
  const [statsData, setStatsData] = useState({
    totalInteractions: 0,
    totalTokens: 0,
    avgLatency: 0,
    estimatedCost: '0.00'
  });
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<'24h' | '7d'>('7d');

  useEffect(() => {
    async function loadAll() {
      try {
        const [statsRes, tsRes, sysRes] = await Promise.allSettled([
          api.get('/analytics/stats'),
          api.get(`/analytics/timeseries?period=${chartPeriod}`),
          api.get('/analytics/system-status'),
        ]);

        if (statsRes.status === 'fulfilled') setStatsData(statsRes.value.data);
        if (tsRes.status === 'fulfilled') setTimeseries(tsRes.value.data);
        if (sysRes.status === 'fulfilled') setSystemStatus(sysRes.value.data);
      } catch (e) {
        console.error('Dashboard load error:', e);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [chartPeriod]);

  const stats = [
    { label: 'Interações Totais', value: statsData.totalInteractions.toLocaleString(), icon: MessageCircle, trend: '+ Live', detail: 'Real-time sync' },
    { label: 'Investimento IA', value: `$${statsData.estimatedCost}`, icon: Sparkles, trend: 'USD', detail: 'Custo estimado' },
    { label: 'Volume de Tokens', value: statsData.totalTokens > 1000 ? (statsData.totalTokens / 1000).toFixed(1) + 'k' : statsData.totalTokens.toString(), icon: Zap, trend: 'In/Out', detail: 'Tokens totais' },
    { label: 'Latência Média', value: `${statsData.avgLatency}ms`, icon: Activity, trend: 'Hardware', detail: 'Tempo de resposta' },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 25, stiffness: 200 } }
  };

  // Chart helpers
  const maxInteractions = Math.max(...timeseries.map(t => t.interactions), 1);

  const systemEntries = systemStatus ? [
    { name: 'WhatsApp Protocol', status: systemStatus.whatsapp.status, color: systemStatus.whatsapp.status === 'Active' ? 'bg-green-500' : 'bg-neutral-400' },
    { name: 'Telegram Neural', status: systemStatus.telegram.status, color: systemStatus.telegram.status === 'Active' ? 'bg-green-500' : 'bg-neutral-400' },
    { name: 'OpenRouter Relay', status: systemStatus.openrouter.status, color: systemStatus.openrouter.status === 'Processing' ? 'bg-amber-500' : systemStatus.openrouter.status === 'Active' ? 'bg-green-500' : 'bg-red-500' },
    { name: 'PGVector Memory', status: systemStatus.pgvector.status, color: systemStatus.pgvector.status === 'Optimized' ? 'bg-green-500' : 'bg-neutral-400' },
  ] : [
    { name: 'WhatsApp Protocol', status: 'Loading...', color: 'bg-neutral-300' },
    { name: 'Telegram Neural', status: 'Loading...', color: 'bg-neutral-300' },
    { name: 'OpenRouter Relay', status: 'Loading...', color: 'bg-neutral-300' },
    { name: 'PGVector Memory', status: 'Loading...', color: 'bg-neutral-300' },
  ];

  // Dynamic insight text
  const insightText = statsData.totalInteractions > 0
    ? `Foram processadas ${statsData.totalInteractions} interações com um custo médio de $${(parseFloat(statsData.estimatedCost) / Math.max(statsData.totalInteractions, 1)).toFixed(6)} por requisição, consumindo ${statsData.totalTokens.toLocaleString()} tokens no total.`
    : 'Nenhuma interação registrada ainda. Envie uma mensagem para um agente para começar a gerar telemetria.';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="font-black uppercase tracking-[0.2em] text-xs opacity-50">Industrializing Intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-l-4 border-primary pl-6 py-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-tighter">Live System</span>
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          </div>
          <h2 className="text-5xl font-black tracking-tighter uppercase italic">
            Dashboard <span className="text-primary italic">Overview</span>
          </h2>
          <p className="text-muted font-bold uppercase tracking-widest text-xs mt-2">
            Monitoramento de Orquestração Lumi v2.0
          </p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => window.location.href = '/agents'}
            className="btn-accent flex items-center gap-2"
          >
            Novo Agente <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Stats Grid */}
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1"
      >
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            variants={item}
            className="industrial-card group flex flex-col justify-between"
          >
            <div className="flex justify-between items-start">
              <div className="p-3 bg-foreground/5 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <stat.icon className="w-5 h-5" />
              </div>
              <TrendingUp className="w-4 h-4 opacity-20" />
            </div>
            
            <div className="mt-8">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-1">{stat.label}</p>
              <h3 className="text-4xl font-black tracking-tighter">{stat.value}</h3>
            </div>

            <div className="mt-6 pt-4 border-t border-border-strong/10 flex items-center justify-between">
              <span className="text-[10px] font-black text-primary uppercase">{stat.trend}</span>
              <span className="text-[10px] font-bold text-muted uppercase italic">{stat.detail}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Primary Content Areas */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Activity Chart Area */}
        <div className="lg:col-span-2 industrial-card min-h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
              <div className="w-1 h-6 bg-primary" />
              Fluxo de Inteligência
            </h3>
            <div className="flex gap-1">
              <button 
                onClick={() => setChartPeriod('24h')}
                className={cn(
                  "text-[10px] font-bold px-2 py-1 border transition-colors",
                  chartPeriod === '24h' 
                    ? 'border-primary bg-primary text-white' 
                    : 'border-border-strong hover:border-primary'
                )}
              >
                24H
              </button>
              <button 
                onClick={() => setChartPeriod('7d')}
                className={cn(
                  "text-[10px] font-bold px-2 py-1 border transition-colors",
                  chartPeriod === '7d' 
                    ? 'border-primary bg-primary text-white' 
                    : 'border-border-strong hover:border-primary'
                )}
              >
                7D
              </button>
            </div>
          </div>
          
          {/* SVG Bar Chart */}
          {timeseries.length > 0 ? (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex items-end gap-[2px] min-h-[220px]">
                {timeseries.map((point, i) => {
                  const heightPct = (point.interactions / maxInteractions) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center justify-end group relative"
                    >
                      {/* Tooltip */}
                      <div className="absolute -top-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                        <div className="bg-foreground text-background text-[9px] font-bold px-2 py-1.5 whitespace-nowrap">
                          <div>{point.interactions} interações</div>
                          <div>{point.tokens} tokens</div>
                          <div>{point.avgLatency}ms latência</div>
                        </div>
                      </div>
                      {/* Bar */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(heightPct, point.interactions > 0 ? 15 : 4)}%` }}
                        transition={{ type: 'spring', damping: 20, stiffness: 100, delay: i * 0.05 }}
                        className={`w-full transition-colors cursor-pointer ${point.interactions > 0 ? 'bg-primary/80 hover:bg-primary' : 'bg-primary/10'}`}
                        style={{ minHeight: point.interactions > 0 ? '20px' : '4px' }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* X-axis labels */}
              <div className="flex gap-[2px] mt-2">
                {timeseries.map((point, i) => (
                  <div key={i} className="flex-1 text-center">
                    <span className="text-[8px] font-bold uppercase text-foreground/40 tracking-wider">{point.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-20">
              <Activity className="w-16 h-16 text-primary animate-[pulse_3s_ease-in-out_infinite]" />
              <p className="mt-6 font-black uppercase tracking-[0.3em] text-xs">Sem dados no período</p>
            </div>
          )}
          
          {/* Bottom Stats — Real Data */}
          <div className="mt-6 pt-6 border-t border-border-strong flex justify-between">
            <div className="flex gap-10">
              <div>
                <p className="text-[10px] font-bold text-muted uppercase">Interações</p>
                <p className="text-xl font-black">{statsData.totalInteractions}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted uppercase">Latência</p>
                <p className="text-xl font-black">{statsData.avgLatency}ms</p>
              </div>
            </div>
            <button 
              onClick={() => window.location.href = '/logs'}
              className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
            >
              Ver análise detalhada
            </button>
          </div>
        </div>

        {/* Status & Quick Actions */}
        <div className="space-y-6 flex flex-col">
          <div className="industrial-card bg-surface">
            <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Sistemas Core
            </h3>
            <div className="space-y-3">
              {systemEntries.map((sys, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border border-border-strong/30 hover:border-border-strong transition-all">
                  <span className="text-xs font-bold uppercase tracking-tight">{sys.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase hidden sm:block">{sys.status}</span>
                    <div className={cn("w-2 h-2 rounded-none", sys.color)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="industrial-card flex-1 border-primary relative overflow-hidden bg-primary/5">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Sparkles className="w-32 h-32 rotate-12" />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-primary mb-4">Lumi Insights</p>
            <h4 className="text-2xl font-black tracking-tighter leading-none mb-6">
              {statsData.totalInteractions > 0 
                ? 'SUA INTELIGÊNCIA ESTÁ OPERANDO.'
                : 'AGUARDANDO PRIMEIRA INTERAÇÃO.'
              }
            </h4>
            <div className="space-y-4">
              <p className="text-xs font-bold leading-relaxed opacity-70">
                {insightText}
              </p>
              <button 
                onClick={() => window.location.href = '/logs'}
                className="w-full btn-accent mt-4"
              >
                Ver Relatório de Custos
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
