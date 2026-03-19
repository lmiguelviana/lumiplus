/**
 * Logger centralizado — substitui console.log/warn/error espalhados.
 * Formato: [TAG] mensagem { dados }
 */

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const logger = {
  info: (tag: string, msg: string, data?: any) => {
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}[${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : '');
  },

  warn: (tag: string, msg: string, data?: any) => {
    console.warn(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}⚠️ [${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : '');
  },

  error: (tag: string, msg: string, data?: any) => {
    console.error(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}❌ [${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : '');
  },

  success: (tag: string, msg: string, data?: any) => {
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}✅ [${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : '');
  },
};
