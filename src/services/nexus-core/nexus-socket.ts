import { Server, Socket } from 'socket.io';

/**
 * 📡 NEXUS SOCKET ORCHESTRATOR
 * Manages high-persistence connections for long-running AI Synthesis.
 */
export const setupNexusSockets = (io: Server) => {
  const nexusNamespace = io.of('/nexus-prime');

  nexusNamespace.on('connection', (socket: Socket) => {
    console.log(`🌌 Nexus Link Established: ${socket.id}`);

    // 1. Join a specific synthesis chamber
    socket.on('synthesis:join', (conversationId: string) => {
      socket.join(conversationId);
      console.log(`🔒 User entered Chamber: ${conversationId}`);
    });

    // 2. High-Persistence Heartbeat
    // Prevents timeouts during 30s+ model generations
    const pulse = setInterval(() => {
      socket.emit('nexus:pulse', { timestamp: Date.now() });
    }, 15000);

    socket.on('disconnect', () => {
      clearInterval(pulse);
      console.log(`🕳️ Nexus Link Severed: ${socket.id}`);
    });
  });
};

/**
 * 🛠️ Socket Config for Server.ts
 * Use these settings to ensure long-running AI streams aren't cut off.
 */
export const nexusSocketOptions = {
  pingTimeout: 60000,   // Wait 60s for pong (extended for AI latency)
  pingInterval: 25000,  // Check every 25s
  cors: {
    origin: ["https://www.janusforge.ai", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
};
