'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bot, Play, CheckCircle2, AlertTriangle, Workflow, Users } from 'lucide-react';

interface Node {
  id: string;
  type: string;
  prompt?: string;
  agentId?: string;
  squadId?: string;
}

interface Edge {
  source: string;
  target: string;
}

interface WorkflowDefinition {
  nodes?: Node[];
  edges?: Edge[];
}

export function FlowVisualizer({ definition }: { definition: WorkflowDefinition | null }) {
  if (!definition || !definition.nodes || definition.nodes.length === 0) {
    return (
      <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center text-[var(--accent)]/40 border border-dashed border-[var(--border-strong)] rounded-xl bg-[var(--surface)]">
        <Workflow className="w-12 h-12 mb-4 opacity-50" />
        <p className="font-mono text-sm tracking-widest uppercase">Canvas Vazio</p>
        <p className="text-xs mt-2 text-muted max-w-[250px] text-center leading-relaxed">
          Descreva sua automação no chat ao lado para que a IA desenhe o diagrama aqui.
        </p>
      </div>
    );
  }

  // Mapeamento simples para linearizar a visualização na V1 (Assumindo fluxo predominantemente sequencial)
  // Em uma v2 usaríamos posições (x,y) reais no canvas.
  const nodeMap = new Map<string, Node>(definition.nodes.map(n => [n.id, n]));
  const orderedNodes: Node[] = [];
  
  // Encontra o start node
  let currentId: string | undefined = definition.edges?.find(e => definition.nodes?.find(n => n.id === e.source)?.type === 'system')?.source || 'start';
  if (!nodeMap.has(currentId)) currentId = definition.nodes[0]?.id; // Fallback
  
  while (currentId) {
    const node = nodeMap.get(currentId);
    if (node) orderedNodes.push(node);
    
    // Pega o próximo
    const nextEdge = definition.edges?.find(e => e.source === currentId);
    currentId = nextEdge?.target;
    if (orderedNodes.find(n => n.id === currentId)) break; // Anti-loop simples
  }

  // Falha de segurança se o sorteador falhar: plota todos no grid
  const displayNodes = orderedNodes.length === definition.nodes.length ? orderedNodes : definition.nodes;

  return (
    <div className="w-full h-full p-8 border border-[var(--border-weak)] rounded-xl bg-background overflow-auto relative shadow-inner">
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, var(--foreground) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
      
      <div className="flex flex-col items-center max-w-2xl mx-auto space-y-6 relative z-10 pb-20 pt-10">
        {displayNodes.map((node, index) => {
          const isStart = node.type === 'system' && node.id === 'start';
          const isSquad = node.type === 'squad_task';
          const isHuman = node.type === 'human_approval';

          return (
            <React.Fragment key={node.id}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.15 }}
                className={`w-full industrial-card p-6 relative group overflow-hidden ${
                  isStart ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' : ''
                }`}
              >
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-foreground/5 to-transparent blur-2xl opacity-50" />
                
                <div className="flex items-start gap-4">
                  <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded flex items-center justify-center border shadow-sm ${
                    isStart ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' :
                    isHuman ? 'border-orange-500/50 text-orange-500 bg-orange-500/10' :
                    isSquad ? 'border-purple-500/50 text-purple-500 bg-purple-500/10' :
                    'border-[var(--border-weak)] text-muted bg-[var(--foreground)]/5'
                  }`}>
                    {isStart ? <Play className="w-5 h-5 ml-1" /> :
                     isHuman ? <AlertTriangle className="w-5 h-5" /> :
                     isSquad ? <Users className="w-5 h-5" /> :
                     <Bot className="w-5 h-5" />}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-mono text-sm tracking-wide text-foreground">
                        {isStart ? 'TRIGGER INICIAL' : 
                         isHuman ? 'APROVAÇÃO HUMANA' : 
                         isSquad ? 'ORQUESTRAÇÃO SQUAD' :
                         'TASK AGENTE'}
                      </h4>
                      <span className="text-[10px] font-mono text-muted uppercase tracking-widest">
                        {node.id}
                      </span>
                    </div>
                    
                    {node.prompt && (
                      <p className="text-sm text-muted leading-relaxed max-w-[90%]">
                        "{node.prompt}"
                      </p>
                    )}
                    
                    {(node.agentId || node.squadId) && (
                      <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 bg-background border border-[var(--border-weak)] rounded-md font-mono text-[10px] text-[var(--accent)] shadow-sm">
                        {node.agentId ? `AGENT_REF: ${node.agentId.substring(0,8)}...` : `SQUAD_REF: ${node.squadId?.substring(0,8)}...`}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Edge Connecting Line */}
              {index < displayNodes.length - 1 && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 24, opacity: 1 }}
                  transition={{ delay: (index * 0.15) + 0.1, duration: 0.3 }}
                  className="w-px bg-gradient-to-b from-[var(--border-strong)] to-[var(--border-weak)] relative"
                >
                   <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 w-2 h-2 border border-[var(--border-strong)] bg-background rounded-full" />
                </motion.div>
              )}
            </React.Fragment>
          );
        })}

        <motion.div
           initial={{ opacity: 0, scale: 0.8 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: displayNodes.length * 0.15 }}
           className="mt-6 flex flex-col items-center opacity-70"
        >
          <div className="w-10 h-10 rounded-full border border-[var(--border-strong)] bg-background flex items-center justify-center shadow-sm">
             <CheckCircle2 className="w-5 h-5 text-muted" />
          </div>
          <span className="font-mono text-[10px] tracking-widest text-muted mt-2">END OF FLOW</span>
        </motion.div>
      </div>
    </div>
  );
}
