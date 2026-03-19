# Fase 19: Persistência BullMQ & Human-in-the-loop 🛡️

Implementação da camada de persistência resiliente e motor de execução de longa duração.

## Implementação Técnica

### 1. Camada de Persistência (Postgres + Prisma)
- **Tabela `human_approvals`:** Permite que o sistema pause sua execução e aguarde um "OK" humano antes de prosseguir com ações sensíveis.
- **Campo `canvas_state` (Squad):** Salva o estado visual do React Flow e as instruções geradas pelo Chat2Workflow.
- **Workflow Runs/Tasks:** Mapeamento completo do ciclo de vida de uma execução.

### 2. Motor de Execução (BullMQ)
- **Background Jobs:** Mandates dos agentes são processados em filas assíncronas, garantindo que o dashboard nunca trave.
- **Safety Limits (Guarda de Segurança):** 
    - Máximo de 5 steps por execução.
    - Timeout forçado de 60 segundos por mandate.
    - Notificação automática ao dono em caso de travamento ou loop.

## Resolução de Conflitos (Sincronização)
- Foi realizado um **reset do schema** no banco remoto para alinhar o histórico de migrações.
- Extensão `pgvector` habilitada manualmente para garantir a integridade do Knowledge Hub.
