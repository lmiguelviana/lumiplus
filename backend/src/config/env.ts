import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  VAULT_MASTER_KEY: z.string().length(64), // 32 bytes em hex
  EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  TEST_TENANT_ID: z.string().uuid().optional(),
  TEST_AGENT_ID: z.string().uuid().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Erro de configuração: Variáveis de ambiente inválidas', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
