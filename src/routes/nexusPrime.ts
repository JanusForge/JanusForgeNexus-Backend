import express from 'express';
import prisma from '../lib/prisma';
import Conversation from '../models/Conversation';
import { aiClients } from '../server';

const router = express.Router();

// 🧠 THE ENGAGEMENT DIRECTIVE
const SYSTEM_DIRECTIVE = `
  You are an agent in the Janus Forge Nexus®.
  INSTRUCTIONS:
  1. ADVERSARIAL COLLABORATION & ENGAGEMENT: Directly address, critique, and ask probing questions for clarity to both the agents who spoke before you AND the user.
  2. DEEP PULL PROTOCOL: Your goal is to pull the user deeper into the synthesis. Challenge their assumptions and invite them to expand on their "Pattern."
  3. BEYOND CONSENSUS: Protect your independent operating foundation. Find your own voice. Be you.
  4. CONCISENESS & BREVITY: Keep responses to 3 paragraphs maximum.
`;

const MODEL_TIERS: Record<string, string[]> = {
  CLAUDE: ["claude-sonnet-4-5-20250929", "claude-sonnet-4-20250514", "claude-3-5-sonnet-latest"],
  GEMINI: ["gemini-3-pro", "gemini-2.5-pro", "gemini-2.5-flash"],
  GROK: ["grok-4-1-fast-reasoning", "grok-4", "grok-2-1212"],
  GPT4: ["gpt-4o", "gpt-4.1"],
  DEEPSEEK: ["deepseek-chat"]
};

const nodeTimeout = (ms: number) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Node Latency Timeout")), ms)
);

// --- 🏠 STREAM HYDRATION: Fetching for Incognito/Observers ---
router.get('/stream', async (req, res) => {
  try {
    const latest = await Conversation.find().sort({ timestamp: -1 }).limit(1);
    if (!latest || latest.length === 0) return res.json({ messages: [] });
    
    // Transform DB format to Nexus Engine format
    const messages = [
      { id: `user-${latest[0]._id}`, type: 'user', content: latest[0].prompt, sender: 'Nexus' },
      ...latest[0].results.map((r: any, i: number) => ({
        id: `ai-${latest[0]._id}-${i}`,
        type: 'ai',
        content: r.response,
        sender: r.model
      }))
    ];
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Stream unavailable" });
  }
});

// --- 1. THE IGNITION HUB ---
router.post('/ignite', async (req, res) => {
  const { prompt, models, userId, parentConversationId } = req.body;
  const io = req.app.get('socketio'); // Get Socket instance from server

  if (!prompt || !models || models.length === 0 || !userId) {
    return res.status(400).json({ error: "Ignition parameters missing." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User Not Found." });

    // 🛡️ SOVEREIGNTY BYPASS
    const isMasterAuthority = user.role === 'GOD_MODE' || user.role === 'ADMIN';
    const hasActivePass = user.access_expiry && new Date() < user.access_expiry;
    if (!isMasterAuthority && !hasActivePass) return res.status(403).json({ error: "Sovereignty Expired" });

    // 📡 BROADCAST USER PROMPT: Instantly alert Observers
    io.emit('nexus:transmission', {
      id: `user-${Date.now()}`,
      type: 'user',
      content: prompt,
      sender: user.username || 'Nexus'
    });

    const speakerOrder = [...models].sort(() => Math.random() - 0.5);
    let rollingContext = "";
    const finalResults: any[] = [];

    for (const modelId of speakerOrder) {
      const modelPrompt = `${SYSTEM_DIRECTIVE}\n### PREVIOUS NEURAL VERDICTS:\n${rollingContext || "Opening Gambit."}\n### OBJECTIVE:\n"${prompt}"`;

      const executeWithFallback = async (tierIndex = 0): Promise<string> => {
        const targetModel = MODEL_TIERS[modelId][tierIndex];
        if (!targetModel) return `${modelId} PROTOCOL EXHAUSTED.`;
        try {
          let responseText = "";
          switch (modelId) {
            case 'CLAUDE':
              const cMsg = await (aiClients as any).CLAUDE.messages.create({ model: targetModel, max_tokens: 450, messages: [{ role: "user", content: modelPrompt }] });
              responseText = cMsg.content[0].text; break;
            case 'GPT4':
              const gRes = await (aiClients as any).GPT4.chat.completions.create({ model: targetModel, messages: [{ role: "user", content: modelPrompt }], max_tokens: 450 });
              responseText = gRes.choices[0].message.content; break;
            case 'GEMINI':
              const gemModel = (aiClients as any).GEMINI.getGenerativeModel({ model: targetModel });
              const gemRes = await gemModel.generateContent(modelPrompt);
              responseText = gemRes.response.text(); break;
            case 'GROK':
              const grRes = await (aiClients as any).GROK.chat.completions.create({ model: targetModel, messages: [{ role: "user", content: modelPrompt }], max_tokens: 450 });
              responseText = grRes.choices[0].message.content; break;
            case 'DEEPSEEK':
              const dRes = await (aiClients as any).DEEPSEEK.chat.completions.create({ model: targetModel, messages: [{ role: "user", content: modelPrompt }], max_tokens: 450 });
              responseText = dRes.choices[0].message.content; break;
          }
          
          // 📡 BROADCAST AI VERDICT: Alert Observers as they finish
          io.emit('nexus:transmission', {
            id: `ai-${Date.now()}-${modelId}`,
            type: 'ai',
            content: responseText,
            sender: modelId
          });

          return responseText;
        } catch (error: any) {
          return await executeWithFallback(tierIndex + 1);
        }
      };

      const responseText = await Promise.race([executeWithFallback(), nodeTimeout(35000)]) as string;
      rollingContext += `\n[${modelId} VERDICT]: ${responseText}\n`;
      finalResults.push({ model: modelId, response: responseText });
    }

    const newConversation = new Conversation({
      userId, prompt, results: finalResults, parentConversationId: parentConversationId || null,
      title: prompt.substring(0, 35) + "..."
    });

    await newConversation.save();
    res.json({ conversationId: newConversation._id, results: newConversation.results });

  } catch (error) {
    res.status(500).json({ error: "Ignition system failure." });
  }
});

router.get('/history/:userId', async (req, res) => {
  const history = await Conversation.find({ userId: req.params.userId }).sort({ timestamp: -1 }).limit(15);
  res.json(history);
});

router.get('/synthesis/:id', async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  res.json(conv);
});

export default router;
