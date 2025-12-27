const express = require('express');
const { PrismaClient } = require('@prisma/client');
const http = require('http');
const cors = require('cors');

console.log(`
╔══════════════════════════════════════════════════╗
║ 🚀 JANUS FORGE NEXUS - PRODUCTION READY         ║
║    AUTONOMOUS CLOUD INFRASTRUCTURE              ║
╚══════════════════════════════════════════════════╝
`);

// ================================================
// CRITICAL: PROFESSIONAL TIER DATABASE CONNECTION
// ================================================
// The platform for civilization-scale discourse requires perpetual thinking.
process.env.DATABASE_URL = 
  'postgresql://janusforge_db_user:ULGk5U42rCFKuOJnZWFOuG0rihKtkcS9@dpg-d56p1bbuibrs739ojang-a.oregon-postgres.render.com/janusforge_db?sslmode=require';

const app = express();
const server = http.createServer(app);

// ================================================
// PRODUCTION CORS CONFIGURATION
// ================================================
const corsOptions = {
  origin: [
    'https://janusforge.ai',
    'https://www.janusforge.ai',
    'https://janus-forge-nexus-react.vercel.app',
    'http://localhost:3000' // Keep for local development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

app.use(cors(corsOptions));
app.use(express.json());

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Health endpoint for Production Bridge
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT NOW() as time`;

    res.json({
      success: true,
      message: '✅ Janus Forge Nexus: Bridge Operational',
      database: 'PROFESSIONAL TIER CONNECTED',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Use the environment PORT if available (required for Render)
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`✅ Server live on port ${PORT}`);
  try {
    await prisma.$connect();
    console.log('✅ Perpetual connection established with Professional Database.');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
});
