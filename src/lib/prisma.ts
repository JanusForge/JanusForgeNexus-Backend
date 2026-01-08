import { PrismaClient } from '@prisma/client'

console.log('🔧 Shared Prisma Client - Using Neon pooler connection')

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.APP_DATABASE_URL
    }
  },
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn']
    : ['error']
})

export default prisma
