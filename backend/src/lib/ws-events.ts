import { EventEmitter } from 'events';

/**
 * Event bus compartilhado para broadcast de status de agentes via WebSocket.
 * O workflow.worker emite eventos aqui; as rotas WS encaminham para os clientes conectados.
 */
export const workflowEvents = new EventEmitter();
workflowEvents.setMaxListeners(100); // suporta muitos clientes WS simultâneos
