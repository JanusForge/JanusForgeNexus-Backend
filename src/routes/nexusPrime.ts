import express from 'express';
import Conversation from '../models/Conversation';
import { aiClients } from '../server';

const router = express.Router();

// 🧠 SURGICAL DIRECTIVE: Max Efficiency & Minimal Latency
const SYSTEM_DIRECTIVE = `
  You are part of the Janus Forge Nexus® Adversarial Cluster.
  STRATEGIC CONSTRAINT: Maximum 3 paragraphs. Be surgical, precise, and adversarial. 
  No filler. No "Certainly!" or "I can help with that." Just raw intelligence.
`;

// Helper: Timeout Race (Prevents one slow API from hanging the UI)
const nodeTimeout = (ms: number) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error("Node Latency Timeout")), ms)
);

// --- 1. NEURAL HISTORY ---
router.get('/history/:userId', async (req, res) => {
  try {
    const history = await Conversation.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(15);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Neural History Desync" });
  }
});

// --- 2. IGNITION (Hyper-Drive Version) ---
router.post('/ignite', async (req, res) => {
  const { prompt, models, userId, parentConversationId } = req.body;

  if (!prompt || !models || models.length === 0) {
    return res.status(400).json({ error: "Ignition parameters missing." });
  }

  try {
    // A. NEURAL RECALL (Truncated to save time/tokens)
    let context = "";
    if (parentConversationId) {
      const previous = await Conversation.findById(parentConversationId);
      if (previous) {
        // Only grab the last 300 characters of each to keep the prompt lean
        context = `CONTEXT: User asked "${previous.prompt}". `;
        context += previous.results.map((r: any) => `${r.model}: ${r.response?.substring(0, 150)}...`).join(" ");
      }
    }

    // B. DISPATCH (Simultaneous Cluster Race)
    const synthesisTasks = models.map(async (modelId: string) => {
      const fullPrompt = `${SYSTEM_DIRECTIVE}\n\n${context}\n\nOBJECTIVE: ${prompt}`;
      
      const executeAI = async () => {
        switch (modelId) {
          case 'CLAUDE':
            const cMsg = await (aiClients as any).CLAUDE.messages.create({
              model: "claude-3-5-sonnet-20240620",
              max_tokens: 450, // ⚡ Capped for speed
              messages: [{ role: "user", content: fullPrompt }]
            });
            return cMsg.content[0].text;

          case 'GPT4':
            const gRes = await (aiClients as any).GPT4.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: fullPrompt }],
              max_tokens: 450 // ⚡ Capped for speed
            });
            return gRes.choices[0].message.content;

          case 'GEMINI':
            const gemModel = (aiClients as any).GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
            const gemRes = await gemModel.generateContent(fullPrompt);
            return gemRes.response.text();

          case 'GROK':
            const grRes = await (aiClients as any).GROK.chat.completions.create({
              model: "grok-2",
              messages: [{ role: "user", content: fullPrompt }],
              max_tokens: 450
            });
            return grRes.choices[0].message.content;

          case 'DEEPSEEK':
            const dRes = await (aiClients as any).DEEPSEEK.chat.completions.create({
              model: "deepseek-chat",
              messages: [{ role: "user", content: fullPrompt }],
              max_tokens: 450
            });
            return dRes.choices[0].message.content;
            
          default: return "Unknown Protocol";
        }
      };

      try {
        // ⏱️ 10-Second Race: If a model is slower than 10s, it gets dropped
        const responseText = await Promise.race([executeAI(), nodeTimeout(10000)]) as string;
        return { model: modelId, response: responseText };
      } catch (err: any) {
        return { model: modelId, response: "PROTOCOL TIMEOUT: Node Latency Exceeded 10s." };
      }
    });

    const results = await Promise.all(synthesisTasks);

    // C. PERSISTENCE
    const newConversation = new Conversation({
      userId,
      prompt,
      results,
      parentConversationId: parentConversationId || null,
      title: prompt.substring(0, 35) + "..."
    });

    await newConversation.save();

    res.json({
      conversationId: newConversation._id,
      results: newConversation.results
    });

  } catch (error) {
    console.error("Critical Failure:", error);
    res.status(500).json({ error: "Ignition system failure." });
  }
});

export default router;
