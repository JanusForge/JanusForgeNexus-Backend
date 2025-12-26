const express = require('express');
const { PrismaClient } = require('@prisma/client');
const http = require('http');
const cors = require('cors');

console.log(`
╔══════════════════════════════════════════════════╗
║ 🚀 JANUS FORGE NEXUS - FORCE CORRECT URL        ║
║           OVERRIDES SHELL ENVIRONMENT            ║
╚══════════════════════════════════════════════════╝
`);

// ================================================
// CRITICAL: OVERRIDE THE SHELL ENVIRONMENT VARIABLE
// ================================================
console.log('🔧 OVERRIDING shell DATABASE_URL...');
console.log('Before override:', process.env.DATABASE_URL ? 'SET (wrong)' : 'NOT SET');

// FORCE the correct URL
process.env.DATABASE_URL = 
  'postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com/janusforge_db?sslmode=require';

console.log('After override: SET (correct)');
console.log('Using database: dpg-d56p1bbuibrs739ojang-a');
console.log('');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Prisma using the FORCED correct URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Health endpoint
app.get('/api/health', async (req, res) => {
  console.log('🏥 Health check requested');
  
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT NOW() as time, 1 as test`;
    
    res.json({
      success: true,
      message: '✅ Professional tier database connected!',
      time: result[0].time,
      database: 'dpg-d56p1bbuibrs739ojang-a (correct)',
      tier: 'PROFESSIONAL',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      note: 'Even with forced correct URL',
      timestamp: new Date().toISOString()
    });
  }
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT version() as version`;
    
    res.json({
      message: 'Database connection test',
      version: result[0].version.split(',')[0],
      connection: 'Shell environment overridden successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 5000;

server.listen(PORT, async () => {
  console.log(`
🎉 Server running: http://localhost:${PORT}
💾 Database: Shell environment OVERRIDDEN
🎯 Using CORRECT database URL

📊 Test endpoints:
   • http://localhost:${PORT}/api/health
   • http://localhost:${PORT}/api/test

✅ This should work now - we forced the correct URL!
  `);
  
  // Test on startup
  console.log('\n🔌 Testing connection on startup...');
  try {
    await prisma.$connect();
    console.log('✅ Connection successful!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
