import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { settingsService } from './src/services/settings.service.js';

async function main() {
    const orgs = await prisma.tenant.findMany();
    for (const org of orgs) {
        const val = await settingsService.get(org.id, 'brevo_api_key');
        if (val && val.endsWith('"}')) {
            const cleanVal = val.replace(/\"\}$/, '');
            await settingsService.set(org.id, 'brevo_api_key', cleanVal, true);
            console.log(`Tenant ${org.id}: cleaned key from trailing suffix.`);
            console.log(`Cleaned: ${cleanVal}`);
        }
    }
    
    // Deleta a Integração Customizada que foi criada por engano ('custom:brevo_api_key')
    await prisma.agentSkill.deleteMany({
        where: { skillId: 'custom:brevo_api_key' }
    });
    console.log("Deleted generic Custom API for brevo.");
}
main().finally(() => prisma.$disconnect());
