import { prisma } from '../lib/prisma.js';


let cachedTenantId: string | null = null;

/**
 * Retorna o ID do tenant padrão (slug 'default').
 * Se não existir, cria. Usado em desenvolvimento para que agentes/chaves/settings persistam.
 */
export async function getOrCreateDefaultTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Lumi Plus Default',
      slug: 'default',
      planTier: 'free'
    }
  });

  cachedTenantId = tenant.id;
  return tenant.id;
}
