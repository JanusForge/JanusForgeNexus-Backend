const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

console.log('🔌 Testing Render.com database connection with SSL...');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '*** Configured ***' : 'Not configured');

// Create Prisma client with explicit SSL configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['error']
});

async function test() {
  try {
    console.log('Attempting connection...');
    
    // Test connection with a timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
    });
    
    const connectPromise = prisma.$connect();
    
    await Promise.race([connectPromise, timeoutPromise]);
    
    console.log('✅ Connected to database!');
    
    // Try a simple query
    const result = await prisma.$queryRaw`SELECT version() as version, current_database() as db`;
    console.log('💾 Database Info:');
    console.log('   Version:', result[0].version);
    console.log('   Database:', result[0].db);
    
    return true;
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('SSL')) {
      console.log('\n💡 SSL connection issue detected.');
      console.log('   For Render.com databases, add ?sslmode=require to DATABASE_URL');
      console.log('   Example: postgresql://user:pass@host:port/db?sslmode=require');
    }
    
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

test().then(success => {
  process.exit(success ? 0 : 1);
});
