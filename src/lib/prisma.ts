import { PrismaClient } from '@prisma/client';

// Ensure we don't leak the pooler string in a way that breaks the direct connection
const baseDbUrl = process.env.DATABASE_URL;
// Add parameters to handle Neon cold-starts (60s timeout)
const connectionUrl = baseDbUrl?.includes('?') 
  ? `${baseDbUrl}&connect_timeout=60&pool_timeout=60` 
  : `${baseDbUrl}?connect_timeout=60&pool_timeout=60`;

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: connectionUrl,
    },
  },
});

// Immediate heartbeat to wake up Neon
prisma.$connect()
  .then(() => console.log("🟢 Janus Database: Link Synchronized on Port 5432"))
  .catch((e) => console.error("🔴 Janus Database: Cold Start Failure", e.message));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
