import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth';
import conversationRoutes from './routes/conversations';
import debateRoutes from './routes/debates';
import healthRoutes from './routes/health';
import dailyForgeRoutes from './routes/dailyForge';

// Import services
import { initializeTierConfigurations } from './services/tierService';

// Import middleware
import { authenticateToken } from './middleware/auth';

// Initialize environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:3000', 'https://janusforge.ai'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Socket.IO setup
// Update this block in src/server.ts
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:3000', 'https://janusforge.ai'],
    credentials: true
  },
  transports: ['polling', 'websocket'], // Add this line to allow fallback
  allowEIO3: true
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('🔌 WebSocket connection:', socket.id);
  
  socket.on('join-conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
    console.log(`   📍 Socket ${socket.id} joined conversation:${conversationId}`);
  });
  
  socket.on('leave-conversation', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
    console.log(`   📍 Socket ${socket.id} left conversation:${conversationId}`);
  });
  
  socket.on('post:new', (postData) => {
    io.to(`conversation:${postData.conversationId}`).emit('post:incoming', postData);
  });
  
  socket.on('ai:response', (responseData) => {
    io.to(`conversation:${responseData.conversationId}`).emit('ai:response', responseData);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 WebSocket disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// --- Change this section in src/server.ts ---

// Public routes (No token needed)
app.use('/api/health', healthRoutes);
app.use('/api/daily-forge', dailyForgeRoutes);
app.use('/api/conversations', conversationRoutes); // Moved here and removed authenticateToken

// Protected routes (Token required)
app.use('/api/auth', authRoutes);
app.use('/api/debates', authenticateToken, debateRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🚨 Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

// Initialize and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Janus Forge Nexus Backend...');
    console.log('📋 Environment:', process.env.NODE_ENV || 'development');
    
    // Initialize tier configurations in database
    await initializeTierConfigurations();
    console.log('✅ Tier configurations initialized');
    
    // Test environment variables
    const requiredVars = [
      'DATABASE_URL',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GROK_API_KEY',
      'DEEPSEEK_API_KEY'
    ];
    
    console.log('🔍 Checking environment variables...');
    requiredVars.forEach(varName => {
      const value = process.env[varName];
      if (value && value.length > 10) {
        console.log(`   ✅ ${varName}: Configured (${value.length} chars)`);
      } else {
        console.log(`   ⚠️  ${varName}: Not configured or too short`);
      }
    });
    
    httpServer.listen(PORT, () => {
      console.log(`
🎄 Janus Forge Nexus Backend Server Running!
=============================================
📡 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Frontend URLs: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
🎯 AI Models: 5 configured
💎 Tiers: Free(2), Basic(3), Professional(5), Enterprise(Custom)
📅 Started: ${new Date().toLocaleString()}

📊 API Endpoints:
   • Health:      http://localhost:${PORT}/api/health
   • AI Status:   http://localhost:${PORT}/api/health/ai-status
   • Ping:        http://localhost:${PORT}/api/health/ping
   • Auth:        http://localhost:${PORT}/api/auth/*
   • WebSocket:   ws://localhost:${PORT}

🔧 To test:
   1. Check health: curl http://localhost:${PORT}/api/health
   2. Test AI APIs: curl http://localhost:${PORT}/api/health/ai-status
   3. Register user: POST http://localhost:${PORT}/api/auth/register

💡 Frontend Connection:
   Update your React app to use API_BASE_URL=http://localhost:${PORT}
      `);
    });
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    console.error('🔧 Check your database connection and API keys in .env file');
    process.exit(1);
  }
};

startServer();
