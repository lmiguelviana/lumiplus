'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Smartphone, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import api from '@/lib/api';

interface ConnectorModalProps {
  agentId: string;
  type: 'whatsapp' | 'telegram' | 'discord';
  onClose: () => void;
}

export function ConnectorModal({ agentId, type, onClose }: ConnectorModalProps) {
  const [status, setStatus] = useState<'IDLE' | 'STARTING' | 'OPEN' | 'QR_READY' | 'CLOSED' | 'ERROR'>('IDLE');
  const [qr, setQr] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (type !== 'whatsapp' || status !== 'STARTING') return;

    // Conecta ao WebSocket do Backend apenas para WhatsApp (QR Code)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001/v1/channels/ws?agentId=${agentId}&type=${type}`;
    
    console.log(`🔗 Conectando ao WS: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'STATUS_UPDATE') {
        setStatus(data.status);
        if (data.qr) setQr(data.qr);
      } else if (data.type === 'ERROR') {
        setStatus('ERROR');
        setErrorMessage(data.message);
      }
    };

    ws.onerror = () => {
      setStatus('ERROR');
      setErrorMessage('Falha na conexão com o gateway de canais.');
    };

    return () => {
      ws.close();
    };
  }, [agentId, type, status]);

  const handleConnectTelegram = async () => {
    if (!token) return;
    setConnecting(true);
    try {
      await api.post(`/channels/${agentId}/connect`, { type, token });
      setStatus('OPEN');
    } catch (error: any) {
      setStatus('ERROR');
      setErrorMessage(error.response?.data?.error || 'Falha ao configurar bot.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-xl"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="industrial-card max-w-lg w-full p-0 overflow-hidden relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-foreground/10 text-muted transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 border-b border-border-strong bg-[var(--surface)]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 text-primary">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic">
                Conectar <span className="text-primary italic">{type === 'whatsapp' ? 'WhatsApp' : 'Telegram'}</span>
              </h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">
                Establish secure uplink for core integration
              </p>
            </div>
          </div>
        </div>

        <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
          {status === 'IDLE' && type !== 'whatsapp' && (
            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center">
                <p className="font-black uppercase tracking-[0.2em] text-xs mb-2">Configuração de Credenciais</p>
                <p className="text-muted font-bold text-[10px] uppercase opacity-60">Insira o token do bot fornecido pelo @BotFather</p>
              </div>

              <div className="space-y-4">
                <div className="industrial-input-group">
                  <label className="text-[10px] font-black uppercase text-primary mb-1 block">Bot Token (BotFather)</label>
                  <input 
                    type="password" 
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="0000000000:AAHH..."
                    className="w-full bg-[var(--surface)] border border-border-strong p-4 text-xs font-mono focus:border-primary outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={handleConnectTelegram}
                  disabled={!token || connecting}
                  className="btn-accent w-full py-4 flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sincronizar Canal'}
                </button>
              </div>
            </div>
          )}

          {status === 'IDLE' && type === 'whatsapp' && (
             <div className="flex flex-col items-center gap-8">
                <div className="text-center">
                  <h4 className="text-xl font-black italic uppercase italic tracking-tighter mb-4">Pronto para o Pareamento?</h4>
                  <p className="text-muted font-bold text-[10px] uppercase max-w-xs mx-auto mb-8">
                    Iniciaremos uma sessão WebSocket para gerar seu QR Code único.
                  </p>
                  <button 
                    onClick={() => setStatus('STARTING')}
                    className="btn-accent px-12"
                  >
                    Gerar QR Code
                  </button>
                </div>
             </div>
          )}

          {status === 'STARTING' && (
            <div className="flex flex-col items-center gap-6">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <div className="text-center">
                <p className="font-black uppercase tracking-[0.2em] text-xs">Aguardando Gateway...</p>
                <p className="text-muted font-bold text-[10px] uppercase mt-2 italic">Procurando session cluster {agentId.slice(0, 4)}</p>
              </div>
            </div>
          )}

          {status === 'QR_READY' && qr && (
            <div className="flex flex-col items-center gap-8">
              <div className="p-4 bg-white border-4 border-primary shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]">
                <QRCodeSVG value={qr} size={256} />
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                   <div className="w-2 h-2 bg-green-500 animate-pulse" />
                   <p className="font-black uppercase tracking-[0.2em] text-xs text-green-500">UPLINK ATIVO - ESCANEIE AGORA</p>
                </div>
                <p className="text-muted font-bold text-[10px] uppercase max-w-xs">
                  Abra o WhatsApp no seu celular &gt; Configurações &gt; Dispositivos Conectados &gt; Conectar um dispositivo.
                </p>
              </div>
            </div>
          )}

          {status === 'OPEN' && (
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="p-6 bg-green-500/10 border border-green-500/30 text-green-500">
                <CheckCircle2 className="w-16 h-16" />
              </div>
              <div className="text-center">
                <h4 className="text-2xl font-black uppercase tracking-tight text-green-500">UPLINK ESTABELECIDO</h4>
                <p className="text-muted font-bold text-[10px] uppercase mt-2">O Agente está agora integrado ao seu WhatsApp.</p>
                <button 
                  onClick={onClose}
                  className="mt-8 btn-accent w-64"
                >
                  Ir para o Dashboard
                </button>
              </div>
            </motion.div>
          )}

          {status === 'CLOSED' && (
            <div className="flex flex-col items-center gap-6">
              <RefreshCw className="w-12 h-12 text-muted animate-spin" />
              <div className="text-center">
                <p className="font-black uppercase tracking-[0.2em] text-xs">Conexão Interrompida</p>
                <p className="text-muted font-bold text-[10px] uppercase mt-2 italic">O gateway fechou a sessão. Tentando restabelecer...</p>
              </div>
            </div>
          )}

          {status === 'ERROR' && (
            <div className="flex flex-col items-center gap-6 text-red-500">
              <AlertCircle className="w-16 h-16" />
              <div className="text-center">
                <h4 className="text-xl font-black uppercase tracking-tight">ERRO NA OPERAÇÃO</h4>
                <p className="text-[10px] font-bold uppercase mt-2 opacity-70 max-w-xs">{errorMessage || 'Falha crítica no sistema de pareamento.'}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="mt-8 py-3 px-8 border border-red-500/30 font-black text-xs uppercase flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all"
                >
                  <RefreshCw className="w-4 h-4" /> Tentar Novamente
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-[var(--surface)] border-t border-border-strong flex justify-between items-center">
           <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary" />
                <span className="text-[10px] font-black uppercase">AES-256</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary" />
                <span className="text-[10px] font-black uppercase">WS Secure</span>
              </div>
           </div>
           <p className="text-[9px] font-bold text-muted uppercase">Connection ID: {agentId.slice(0, 12)}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
