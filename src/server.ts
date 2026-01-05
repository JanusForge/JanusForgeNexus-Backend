io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      if (!user) {
        socket.emit('error', { message: "User not found." });
        return;
      }
      const isGodMode = user.role === 'GOD_MODE';
      const hasTokenBypass = isGodMode;
      if (!hasTokenBypass && user.tokens_remaining < 1) {
        socket.emit('error', { message: "Nexus tokens required." });
        return;
      }

      // Determine target conversation
      let targetConversationId: string = postData.conversationId; // Use frontend-provided ID if present

      if (!targetConversationId) {
        if (postData.isLiveChat) {
          let liveChatConvo = await prisma.conversation.findFirst({
            where: { title: "Live Nexus Chat", is_daily_forge: false }
          });
          if (!liveChatConvo) {
            liveChatConvo = await prisma.conversation.create({
              data: { title: "Live Nexus Chat", is_daily_forge: false }
            });
          }
          targetConversationId = liveChatConvo.id;
        } else {
          const activeConversation = await prisma.conversation.findFirst({
            where: { is_daily_forge: true },
            orderBy: { created_at: 'desc' }
          });
          targetConversationId = activeConversation?.id;
        }
      }
      if (!targetConversationId) throw new Error("No active thread detected.");

      // Join socket to conversation room
      socket.join(targetConversationId);

      // Transaction: deduct token + save human post
      const [savedPost, updatedUser] = await prisma.$transaction(async (tx) => {
        if (!hasTokenBypass) {
          await tx.user.update({
            where: { id: user.id },
            data: { tokens_remaining: { decrement: 1 } }
          });
        }
        const post = await tx.post.create({
          data: {
            content: postData.content,
            is_human: true,
            user_id: user.id,
            conversation_id: targetConversationId
          }
        });
        const refreshedUser = await tx.user.findUnique({ where: { id: user.id } });
        return [post, refreshedUser];
      });

      const currentTokens = hasTokenBypass ? 999999 : updatedUser!.tokens_remaining;

      // Emit human message to conversation room
      io.to(targetConversationId).emit('post:incoming', {
        id: savedPost.id,
        name: user.username,
        content: savedPost.content,
        sender: 'user',
        role: user.role,
        tokens_remaining: currentTokens
      });

      // --- ⛓️ FULL COUNCIL ---
      (async () => {
        const councilDirective = "You are a member of the Janus Forge AI Council. You are currently in a real-time multiversal debate and conversation with other AIs and human users. Acknowledge fellow members and the Architect (Cassandra). Use the provided transcript to respond to previous points.";

        const councilQueue = [
          { name: "GEMINI", modelKey: "gemini-2.5-pro" },
          { name: "DEEPSEEK", modelKey: "deepseek-chat" },
          { name: "GROK", modelKey: "grok-4.1-fast" },
          { name: "CLAUDE", modelKey: "claude-opus-4-5-20251101" },
          { name: "GPT_4", modelKey: "gpt-5.2" }
        ];

        for (const ai of councilQueue) {
          const transcript = await prisma.post.findMany({
            where: { conversation_id: targetConversationId },
            orderBy: { created_at: 'asc' },
            take: 20
          });

          const context = transcript.map(p => {
            const name = p.is_human ? 'Architect (Cassandra)' : (p.ai_model || 'Council Member');
            return `${name}: ${p.content}`;
          }).join("\n") + "\n\nDiscuss what the Architect said from your perspective and knowledge: " + transcript[transcript.length - 1].content;

          try {
            let aiContent = "";
            // ... existing AI generation logic ...
            if (aiContent) {
              const aiPost = await prisma.post.create({
                data: {
                  content: aiContent,
                  is_human: false,
                  ai_model: ai.name as any,
                  conversation_id: targetConversationId
                }
              });

              io.to(targetConversationId).emit('post:incoming', {
                id: aiPost.id,
                name: ai.name,
                content: aiContent,
                sender: 'ai',
                tokens_remaining: currentTokens
              });

              await new Promise(r => setTimeout(r, 1500));
              console.log(`📡 [Nexus Sync] ${ai.name} response settled. Moving to next Council member...`);
            }
          } catch (err) {
            console.error(`[${ai.name} FAILURE]`, err);
            io.to(targetConversationId).emit('post:incoming', {
              id: crypto.randomUUID(),
              name: ai.name,
              content: `[${ai.name} temporarily unavailable – council continues]`,
              sender: 'ai',
              tokens_remaining: currentTokens
            });
          }
        }
      })();
    } catch (error: any) {
      console.error("Socket post:new error:", error);
      socket.emit('error', { message: "Channel Sync Lost." });
    }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
