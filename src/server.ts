// --- ⛓️ SEQUENTIAL SIGHT PROTOCOL (UPDATED FOR CLAUDE 4.5 & PRISMA FIX) ---
(async () => {
  const isFullCouncil = isGodMode || isEnterprise || isBeta || user.role === 'PROFESSIONAL';
  const isBasicPlus = isBeta || user.role === 'BASIC' || isFullCouncil;

  const councilQueue = [];
  councilQueue.push({ name: "GEMINI", modelKey: "gemini-1.5-flash" });
  councilQueue.push({ name: "DEEPSEEK", modelKey: "deepseek-chat" });
  if (isBasicPlus) councilQueue.push({ name: "GROK", modelKey: "grok-beta" });
  
  if (isFullCouncil) {
    // UPDATED: Using the 2026 Frontier IDs for the High Council
    councilQueue.push({ name: "CLAUDE", modelKey: "claude-opus-4-5-20251101" });
    councilQueue.push({ name: "GPT_4", modelKey: "gpt-4o" });
  }

  for (const ai of councilQueue) {
    // Fetch updated transcript so the AI can "see" previous responses
    const transcript = await prisma.post.findMany({
      where: { conversation_id: targetConversationId },
      orderBy: { created_at: 'asc' },
      take: 15 // Increased window for advanced context
    });

    const context = transcript.map(p => `${p.is_human ? 'User' : (p.ai_model || 'AI')}: ${p.content}`).join("\n\n");

    try {
      let aiContent = "";
      if (ai.name === "GEMINI") {
        const res = await genAI.getGenerativeModel({ model: ai.modelKey }).generateContent(context);
        aiContent = res.response.text();
      } else if (ai.name === "DEEPSEEK") {
        const res = await deepseek.chat.completions.create({
          model: ai.modelKey,
          messages: [{ role: "system", content: "You are a member of the AI Council. Respond to the user and acknowledge previous AI points." }, { role: "user", content: context }]
        });
        aiContent = res.choices[0].message.content || "";
      } else if (ai.name === "GROK") {
        const res = await openai.chat.completions.create({ model: ai.modelKey, messages: [{ role: "user", content: context }] });
        aiContent = res.choices[0].message.content || "";
      } else if (ai.name === "CLAUDE") {
        const res = await anthropic.messages.create({ 
          model: ai.modelKey, 
          max_tokens: 1500, 
          messages: [{ role: "user", content: context }] 
        });
        aiContent = (res.content[0] as any).text;
      } else if (ai.name === "GPT_4") {
        const res = await openai.chat.completions.create({ model: ai.modelKey, messages: [{ role: "user", content: context }] });
        aiContent = res.choices[0].message.content || "";
      }

      if (aiContent) {
        // FIXED: Mapping to 'ai_model' to match your Prisma Participant enum
        await prisma.post.create({
          data: {
            content: aiContent,
            is_human: false,
            ai_model: ai.name as any, 
            conversation_id: targetConversationId
          }
        });
        io.emit('post:incoming', { id: crypto.randomUUID(), name: ai.name, content: aiContent, sender: 'ai', role: 'COUNCIL' });
      }
    } catch (err) {
      console.error(`[${ai.name} FAILURE]`, err);
    }
  }
})();
