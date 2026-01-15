import { Server, Socket } from 'socket.io';

/**
 * 📡 NEXUS SOCKET ORCHESTRATOR
 * Manages high-persistence connections for long-running 5-AI Cluster Synthesis.
 */
export const setupNexusSockets = (io: Server) => {
  const nexusNamespace = io.of('/nexus-prime');

  nexusNamespace.on('connection', (socket: Socket) => {
    // Authority logging for the Master Account [cite: 2025-11-27]
    console.log(`🌌 Nexus Prime: Secure Link Established [ID: ${socket.id}]`);

    // 1. Join a specific synthesis chamber
    socket.on('synthesis:join', (conversationId: string) => {
      if (!conversationId) return;
      socket.join(conversationId);
      
      // Emit immediate confirmation to trigger the "Council Ready" state in the UI
      socket.emit('synthesis:status', { 
        message: "Neural link confirmed. Firebreak isolation active." 
      });
      
      console.log(`🔒 Secure Chamber Joined: ${conversationId}`);
    });

    // 2. High-Persistence Heartbeat (The "Nexus Pulse")
    // Prevents Render/Vercel from killing the socket during heavy 30s+ AI reasoning
    const pulse = setInterval(() => {
      socket.emit('nexus:pulse', { 
        timestamp: Date.now(),
        status: 'synchronous'
      });
    }, 15000);

    socket.on('disconnect', (reason) => {
      clearInterval(pulse);
      console.log(`🕳️ Nexus Link Severed: ${socket.id} | Reason: ${reason}`);
    });
  });
};

/**
 * 🛠️ Socket Engine Optimization
 * Optimized for high-latency Frontier Models (Claude 4.5, GPT-5.2)
 */
export const nexusSocketOptions = {
  pingTimeout: 60000,   // Wait 60s for pong (Crucial for deep-thinking AI modes)
  pingInterval: 25000,  // Check every 25s
  transports: ['websocket', 'polling'], // Allow fallback if WebSockets are throttled
  allowEIO3: true       // Compatibility for legacy frontend wrappers
};
