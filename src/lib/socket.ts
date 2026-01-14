// src/lib/socket.ts
import { Server } from 'socket.io';

export const initSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    // Allows the frontend to subscribe to a specific conversation
    socket.on('join:room', (conversationId: string) => {
      socket.join(conversationId);
      console.log(`Neural Node joined room: ${conversationId}`);
    });

    socket.on('disconnect', () => {
      console.log('Neural Node disconnected');
    });
  });

  return io;
};
