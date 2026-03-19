import { prisma } from '../src/lib/prisma.js';
import { settingsService } from '../src/services/settings.service.js';
import { env } from '../src/config/env.js';

/**
 * Script utilitário para migrar chaves do .env para o Banco de Dados (BYOK).
 * Ele lê as chaves atuais do .env e as preenche para o Tenant padrão de desenvolvimento.
 */
async function migrateEnvToDb() {
  console.log('🔄 Iniciando migração do .env para Workspace Settings...');

  // Em produção, isso iteraria por todos os tenants ou usaria o tenant de sistema principal
  const tenantId = process.env.TEST_TENANT_ID || '123e4567-e89b-12d3-a456-426614174000';

  // Verifica se o tenant existe, senão cria um mock para desenvolvimento
  let tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Default Workspace',
        slug: 'default-workspace',
      }
    });
    console.log('✅ Tenant padrão criado.');
  }

  const keysToMigrate = [
    { envKey: 'OPENROUTER_API_KEY', dbKey: 'openrouter_key', isSecret: true },
    { envKey: 'GROQ_API_KEY', dbKey: 'groq_key', isSecret: true },
    { envKey: 'BRAVE_SEARCH_KEY', dbKey: 'brave_search_key', isSecret: true },
    { envKey: 'OPENAI_API_KEY', dbKey: 'openai_key', isSecret: true },
    { envKey: 'ANTHROPIC_API_KEY', dbKey: 'anthropic_key', isSecret: true },
  ];

  let migratedCount = 0;

  for (const mapping of keysToMigrate) {
    const envValue = process.env[mapping.envKey];
    
    if (envValue && envValue.trim() !== '') {
      try {
        await settingsService.set(tenantId, mapping.dbKey, envValue, mapping.isSecret);
        console.log(`✅ Chave migrada com sucesso: ${mapping.envKey} -> ${mapping.dbKey}`);
        migratedCount++;
      } catch (error: any) {
        console.error(`❌ Erro ao migrar ${mapping.envKey}:`, error.message);
      }
    } else {
      console.log(`ℹ️ Ignorada (não encontrada no .env): ${mapping.envKey}`);
    }
  }

  console.log(`🎉 Migração concluída! ${migratedCount} chaves migradas para o banco.`);
  process.exit(0);
}

migrateEnvToDb().catch(e => {
  console.error('Fatal Error:', e);
  process.exit(1);
});
