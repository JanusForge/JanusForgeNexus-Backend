import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Optimize for Neon
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Handle clean shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

export default prisma
