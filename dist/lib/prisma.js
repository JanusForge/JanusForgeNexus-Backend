// src/lib/prisma.ts - Simple Shared Prisma Client for Render/Neon
import { PrismaClient } from '@prisma/client';
console.log('🔧 Initializing Shared Prisma Client - Neon pooler connection');
// Global cache to prevent multiple instances
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = prisma;
export default prisma;
