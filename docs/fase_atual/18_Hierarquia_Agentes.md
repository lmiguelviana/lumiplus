# Fase 18: Hierarquia Agent-Employee & Comando 🎖️

Nesta fase, abandonamos o conceito de automação genérica para adotar uma estrutura de **Hierarquia Militar/Organizacional** de agentes.

## Objetivos Alcançados

### 1. Novo Paradigma: Liderança & Execução
- **Agente Principal (Boss):** Atua como o cérebro da Squad, recebendo objetivos e planejando a execução.
- **Employees (Minions):** Agentes especialistas (Pesquisador, Redator, Analista, Designer, Revisor) que recebem mandates específicos do líder.

### 2. UI: Command Center Interativo
- **Squad Containers:** Os containers agora funcionam como unidades de comando.
- **Sistema de Zoom Inteligente:** 
    - Ao aproximar o zoom (`isZoomedIn > 0.6`), a Squad revela ferramentas de gestão interna.
    - **Botão "+ Adicionar Empregado":** Permite spawnar subordinados diretamente dentro da Squad.
- **Nesting Automático:** Subordinados são vinculados ao `parentId` da Squad e herdam comportamentos do grupo.

## Diferenciais Técnicos
- Mantemos a flexibilidade do `React Flow` mas com lógica de `nesting` rígida via `parentId`.
- Visual "Industrial Light" com feedback de status em tempo real.
