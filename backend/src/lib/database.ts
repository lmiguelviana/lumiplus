import { env } from '../config/env.js';

/** Tipo de banco detectado pela DATABASE_URL */
export type DatabaseProvider = 'postgresql' | 'sqlite';

/** Detecta o provider de banco pela URL de conexão */
export function getDatabaseProvider(): DatabaseProvider {
  const url = env.DATABASE_URL;
  if (url.startsWith('file:') || url.endsWith('.db') || url.includes('sqlite')) {
    return 'sqlite';
  }
  return 'postgresql';
}

/** Atalhos úteis */
export const isPostgres = () => getDatabaseProvider() === 'postgresql';
export const isSQLite = () => getDatabaseProvider() === 'sqlite';
