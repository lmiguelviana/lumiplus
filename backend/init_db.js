import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function init() {
  console.log('Enabling pgvector extension...');
  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log('Success!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

init();
