import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

// Immediate connection check to wake up Neon [cite: 2025-11-27]
prisma.$connect()
  .then(() => console.log("🟢 Neon Sync: Database is Online"))
  .catch((e) => console.error("🔴 Neon Sync: Connection Failure", e));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
