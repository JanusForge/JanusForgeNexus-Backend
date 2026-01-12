console.log('🔧 Initializing Shared Prisma Client - Neon pooler connection');
// Global cache to prevent multiple instances (critical for hot-reload in dev)
const globalForPrisma = global;
let prisma;
// Create or reuse client
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
    // In development, attach to global to preserve across hot-reloads
    if (process.env.NODE_ENV !== 'production') {
        globalForPrisma.prisma = prisma;
    }
}
else {
    prisma = globalForPrisma.prisma;
    console.log('♻️ Reusing existing Prisma Client instance');
}
export default prisma;
