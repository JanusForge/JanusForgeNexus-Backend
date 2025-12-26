const express = require('express');
const { PrismaClient } = require('@prisma/client');
const http = require('http');

console.log('🚀 Starting with VERIFIED CORRECT URL...');
console.log('=========================================');

// YOUR VERIFIED CORRECT URL
const CORRECT_URL = 'postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com/janusforge_db?sslmode=require';

console.log('Using URL from Render dashboard:');
console.log('Host: dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com');
console.log('User: janusforge_db_user');
console.log('Database: janusforge_db');
console.log('');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: CORRECT_URL
    }
  },
  log: ['info', 'warn', 'error']
});

const app = express();
const server = http.createServer(app);

app.use(express.json());

// Test endpoint
app.get('/api/test', async (req, res) => {
  console.log('Testing connection...');
  
  try {
    // Simple test query
    const result = await prisma.$queryRaw`SELECT NOW() as time, 1 as test`;
    
    res.json({
      success: true,
      message: 'Database connected!',
      time: result[0].time,
      test: result[0].test,
      database: 'Professional tier active'
    });
    
  } catch (error) {
    console.error('Query error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

// Health endpoint
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$connect();
    
    // Count users
    const userCount = await prisma.user.count();
    
    res.json({
      status: 'healthy',
      tier: 'PROFESSIONAL',
      database: 'connected',
      users: userCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

const PORT = 5000;

server.listen(PORT, async () => {
  console.log(`
🎉 Server started on port ${PORT}
📡 Test URL: http://localhost:${PORT}/api/test
💾 Using YOUR verified Render database URL
🎯 Professional tier should work now!
  `);
  
  // Test connection on startup
  console.log('\n🔌 Testing initial connection...');
  try {
    await prisma.$connect();
    console.log('✅ Prisma connected successfully!');
  } catch (error) {
    console.error('❌ Prisma connection failed:', error.message);
  }
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
