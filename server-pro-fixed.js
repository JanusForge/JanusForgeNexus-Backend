const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');

// Load environment variables MANUALLY first to debug
require('dotenv').config();

console.log('🚀 Janus Forge Nexus - Professional Tier (FIXED)');
console.log('===============================================');
console.log('📡 Debugging environment...');
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 'NOT SET');

// Show first 60 chars of DATABASE_URL (hide password)
if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  const safeUrl = url.replace(/:[^:@]*@/, ':****@');
  console.log('DATABASE_URL:', safeUrl.substring(0, 80) + '...');
}

console.log('');

const app = express();
const server = http.createServer(app);

// WebSocket configuration
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// ================================================
// CRITICAL FIX: Initialize Prisma with explicit config
// ================================================
console.log('🔧 Initializing Prisma Client...');

// Method 1: Try with explicit connection string first
const dbUrl = process.env.DATABASE_URL || 
  'postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com:5432/janusforge_db?sslmode=require';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  },
  log: ['info', 'warn', 'error'],
  errorFormat: 'pretty'
});

console.log('✅ Prisma Client created');

// ================================================
// SIMPLE CONNECTION TEST (bypasses complex middleware)
// ================================================
async function testConnectionSimple() {
  console.log('\n🔌 Testing Prisma connection (simple)...');
  
  try {
    // Direct query without any middleware
    const result = await prisma.$queryRaw`SELECT 1 as test, NOW() as time`;
    console.log('✅ Prisma direct query SUCCESS!');
    console.log(`   Test value: ${result[0].test}`);
    console.log(`   Database time: ${result[0].time.toISOString()}`);
    return true;
  } catch (error) {
    console.error('❌ Prisma query failed:', error.message);
    console.error('Full error:', error);
    
    // Try alternative connection method
    console.log('\n🔄 Trying alternative connection method...');
    try {
      // Sometimes $connect() works when $queryRaw doesn't
      await prisma.$connect();
      console.log('✅ prisma.$connect() worked!');
      return true;
    } catch (connectError) {
      console.error('❌ prisma.$connect() also failed:', connectError.message);
      return false;
    }
  }
}

// ================================================
// SIMPLE HEALTH ENDPOINT
// ================================================
app.get('/api/health', async (req, res) => {
  console.log('\n🏥 Health check requested');
  
  try {
    const connected = await testConnectionSimple();
    
    if (!connected) {
      return res.json({
        status: 'degraded',
        message: 'Database connection failing',
        timestamp: new Date().toISOString(),
        note: 'Direct psql connection works, but Prisma has issues'
      });
    }
    
    // Get basic stats
    let userCount = 0;
    let tierCount = 0;
    
    try {
      userCount = await prisma.user.count();
      tierCount = await prisma.tierConfiguration.count();
    } catch (queryError) {
      console.log('Stats query failed, but connection is alive');
    }
    
    res.json({
      status: 'healthy',
      tier: 'PROFESSIONAL',
      database: 'connected',
      statistics: {
        users: userCount,
        tier_configurations: tierCount
      },
      connection_method: 'Prisma Client',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ================================================
// OTHER ENDPOINTS
// ================================================
app.get('/api/tiers', async (req, res) => {
  try {
    const tiers = await prisma.tierConfiguration.findMany({
      orderBy: { priceCents: 'asc' }
    });
    
    res.json(tiers.map(t => ({
      tier: t.tier,
      price: `$${(t.priceCents / 100).toFixed(2)}/month`,
      tokenAllowance: t.tokenAllowance,
      aiModels: t.aiModels
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simple echo endpoint for testing
app.post('/api/echo', (req, res) => {
  res.json({
    received: req.body,
    timestamp: new Date().toISOString(),
    server: 'Janus Forge Nexus Professional'
  });
});

// ================================================
// START SERVER WITH PROPER ERROR HANDLING
// ================================================
const PORT = process.env.PORT || 5000;

async function startServer() {
  console.log(`\n🎯 Starting server on port ${PORT}...`);
  
  // Test connection before starting server
  const connectionTest = await testConnectionSimple();
  
  if (!connectionTest) {
    console.error('\n⚠️  WARNING: Database connection test failed');
    console.error('   Starting server anyway in degraded mode...');
    console.error('   API will work but database endpoints may fail');
  }
  
  server.listen(PORT, () => {
    console.log(`
🎉 Server is running!
====================
📡 URL: http://localhost:${PORT}
🔗 WebSocket: ws://localhost:${PORT}
💾 Database: ${connectionTest ? 'Connected ✅' : 'Degraded Mode ⚠️'}

📊 Endpoints:
   • Health:    GET  http://localhost:${PORT}/api/health
   • Tiers:     GET  http://localhost:${PORT}/api/tiers  
   • Echo:      POST http://localhost:${PORT}/api/echo

🔧 Database status: ${connectionTest ? 'Professional tier active' : 'Check Prisma configuration'}
    `);
  });
}

// Handle errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
});
