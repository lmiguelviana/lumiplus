import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Conexão centralizada com o Redis.
 * Usada pelo BullMQ e pelo cache do sistema.
 */
export let isRedisAvailable = false;

// Aviso de Redis indisponível é logado apenas uma vez
let _redisWarningLogged = false;

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Obrigatório para BullMQ
  lazyConnect: true,
  connectTimeout: 3000,
  // Para de tentar reconectar após falha inicial (sem Redis local)
  retryStrategy: (times) => {
    if (times >= 1) return null; // desiste na primeira falha
    return 500;
  },
});

redis.on('error', () => {
  isRedisAvailable = false;
  if (!_redisWarningLogged) {
    _redisWarningLogged = true;
    console.warn('⚠️ Redis não disponível. Modo Zero-Redis ativo (processamento em memória).');
  }
});

redis.on('connect', () => {
  _redisWarningLogged = false;
  isRedisAvailable = true;
  console.log('✅ Conectado ao Redis com sucesso!');
});

// Tenta conectar uma vez; se falhar, opera em modo Zero-Redis
redis.connect().catch(() => {
  isRedisAvailable = false;
});
