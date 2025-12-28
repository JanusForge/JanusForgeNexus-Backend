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
import { initializeTierConfigs } from './services/tierService';

// Import middleware
import { authenticateToken } from './middleware/auth';

// Initialize environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// --- REPAIRED CORS CONFIGURATION ---
const allowedOrigins = [
  'http://localhost:3000',
  'https://janusforge.ai',
  'https://www.janusforge.ai',
  'https://janus-forge-nexus-react.vercel.app'
];

// If you have FRONTEND_URL in Render env, add those too
if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach(url => {
    if (!allowedOrigins.includes(url.trim())) {
      allowedOrigins.push(url.trim());
    }
  });
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// --- REPAIRED SOCKET.IO SETUP ---
const io = new Server(httpServer, {
  path: '/socket.io/', // Explicitly set for Render routing
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket'], // Essential for Render sticky sessions
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('🔌 WebSocket connection:', socket.id);

  socket.on('join-conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
    console.log(`    📍 Socket ${socket.id} joined conversation:${conversationId}`);
  });

  socket.on('leave-conversation', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
    console.log(`    📍 Socket ${socket.id} left conversation:${conversationId}`);
  });

  socket.on('post:new', async (postData) => {
    // 1. Relay the human message so you see it in the feed immediately
    io.to(`conversation:${postData.conversationId}`).emit('post:incoming', postData);
    console.log(`💬 Message from ${postData.name}: ${postData.content}`);

    // 2. TRIGGER THE AI RESPONSE
    // For now, we simulate the "Council" responding. 
    // This satisfies the frontend's 'ai:response' listener.
    setTimeout(() => {
      const aiResponse = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        avatar: '🤖',
        name: 'Councilor JANUS-7',
        role: 'Nexus Overseer',
        content: `I have received your transmission, ${postData.name}. The Council is analyzing "${postData.content.substring(0, 30)}..." for the Daily Forge.`,
        timestamp: new Date().toISOString(),
        tier: 'enterprise',
        likes: 0,
        replies: 0
      };

      // This is the specific event your frontend is waiting for!
      io.to(`conversation:${postData.conversationId}`).emit('ai:response', { post: aiResponse });
      console.log(`🤖 Council responded to ${postData.id}`);
    }, 2000); // 2-second delay to make it feel like "thinking"
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

// --- ROUTES ---
app.use('/api/health', healthRoutes);
app.use('/api/daily-forge', dailyForgeRoutes);
app.use('/api/conversations', conversationRoutes); 
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
    
    // Initialize tier configurations in database
    await initializeTierConfigs();
    console.log('✅ Tier configurations initialized');

    httpServer.listen(PORT, () => {
      console.log(`
🎄 Janus Forge Nexus Backend Server Running!
=============================================
📡 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'production'}
🔗 Allowed Origins: ${allowedOrigins.join(', ')}
      `);
    });
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
