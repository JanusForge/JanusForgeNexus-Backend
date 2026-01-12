// src/lib/prisma.ts - Reconnecting Prisma Client for Render/Neon
import prisma from './lib/prisma';

console.log('🔧 Initializing Shared Prisma Client - Neon pooler connection');

// Global cache to prevent multiple instances
const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient;

if (!globalForPrisma.prisma) {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  // Auto-reconnect on connection errors/closures
  prisma.$on('error', (e) => {
    console.error('Prisma connection error detected:', e);
    console.log('🔄 Re-creating Prisma client...');
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: ['error'],
    });
    prisma = globalForPrisma.prisma;
  });

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
} else {
  prisma = globalForPrisma.prisma;
  console.log('♻️ Reusing existing Prisma Client instance');
}

export default prisma;
