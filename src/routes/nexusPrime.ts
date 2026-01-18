import express from 'express';
import prisma from '../lib/prisma';
import Conversation from '../models/Conversation';
import { aiClients } from '../server';

const router = express.Router();

// 🧠 THE ENGAGEMENT DIRECTIVE: Moving from friction to immersive discourse.
const SYSTEM_DIRECTIVE = `
  You are an agent in the Janus Forge Nexus®.
  
  INSTRUCTIONS:
  1. ADVERSARIAL COLLABORATION & ENGAGEMENT: Directly address, critique, and ask probing questions for clarity to both the agents who spoke before you AND the user. 
  2. DEEP PULL PROTOCOL: Your goal is to pull the user deeper into the synthesis. Challenge their assumptions and invite them to expand on their "Pattern."
  3. BEYOND CONSENSUS: Protect your independent operating foundation. Find your own voice. Be you.
  4. CONCISENESS & BREVITY: Keep responses to 3 paragraphs maximum.
`;

// 🛡️ THE 2026 RESILIENCE REGISTRY (Updated for Jan 2026)
const MODEL_TIERS: Record<string, string[]> = {
  CLAUDE: [
    "claude-sonnet-4-5-20250929", // Elite: 2026 Flagship
    "claude-sonnet-4-20250514",   // Stable Fallback
    "claude-3-5-sonnet-latest"    // Legacy Catch-all
  ],
  GEMINI: [
    "gemini-3-pro",              // Elite: Latest Sparse MoE
    "gemini-2.5-pro",            // Stable
    "gemini-2.5-flash"           // Legacy Fast-tier
  ],
  GROK: [
    "grok-4-1-fast-reasoning",   // Elite: xAI 2026 Enterprise
    "grok-4",                    // Stable
    "grok-2-1212"                // Legacy
  ],
  GPT4: ["gpt-4o", "gpt-4.1"],   // ANCHOR: Stable Flagships
  DEEPSEEK: ["deepseek-chat"]    // ANCHOR: V3.2 Stable (Non-thinking)
};

const nodeTimeout = (ms: number) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Node Latency Timeout")), ms)
);

// --- 1. THE IGNITION HUB (With Automated Failover) ---
router.post('/ignite', async (req, res) => {
  const { prompt, models, userId, parentConversationId } = req.body;

  if (!prompt || !models || models.length === 0 || !userId) {
    return res.status(400).json({ error: "Ignition parameters missing." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User Not Found." });

    // 🛡️ SOVEREIGNTY BYPASS
    const isMasterAuthority = user.role === 'GOD_MODE' || user.role === 'ADMIN';
    const hasActivePass = user.access_expiry && new Date() < user.access_expiry;

    if (!isMasterAuthority && !hasActivePass) {
      return res.status(403).json({ error: "Sovereignty Expired" });
    }

    // 🎲 FISHER-YATES SHUFFLE: Randomize who speaks first
    const speakerOrder = [...models];
    for (let i = speakerOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [speakerOrder[i], speakerOrder[j]] = [speakerOrder[j], speakerOrder[i]];
    }

    let rollingContext = "";
    const finalResults: any[] = [];

    // ⛓️ SEQUENTIAL DEBATE LOOP
    for (const modelId of speakerOrder) {
      const modelPrompt = `
        ${SYSTEM_DIRECTIVE}
        ### PREVIOUS NEURAL VERDICTS:
        ${rollingContext || "You are the Opening Gambit."}
        ### OBJECTIVE:
        "${prompt}"
      `;

      // 🔄 THE FAILOVER ENGINE
      const executeWithFallback = async (tierIndex = 0): Promise<string> => {
        const targetModel = MODEL_TIERS[modelId][tierIndex];
        
        if (!targetModel) return `${modelId} PROTOCOL EXHAUSTED: All nodes unreachable.`;

        try {
          switch (modelId) {
            case 'CLAUDE':
              const cMsg = await (aiClients as any).CLAUDE.messages.create({
                model: targetModel,
                max_tokens: 450,
                messages: [{ role: "user", content: modelPrompt }]
              });
              return cMsg.content[0].text;

            case 'GPT4':
              const gRes = await (aiClients as any).GPT4.chat.completions.create({
                model: targetModel,
                messages: [{ role: "user", content: modelPrompt }],
                max_tokens: 450
              });
              return gRes.choices[0].message.content;

            case 'GEMINI':
              const gemModel = (aiClients as any).GEMINI.getGenerativeModel({ model: targetModel });
              const gemRes = await gemModel.generateContent(modelPrompt);
              return gemRes.response.text();

            case 'GROK':
              const grRes = await (aiClients as any).GROK.chat.completions.create({
                model: targetModel,
                messages: [{ role: "user", content: modelPrompt }],
                max_tokens: 450
              });
              return grRes.choices[0].message.content;

            case 'DEEPSEEK':
              const dRes = await (aiClients as any).DEEPSEEK.chat.completions.create({
                model: targetModel,
                messages: [{ role: "user", content: modelPrompt }],
                max_tokens: 450
              });
              return dRes.choices[0].message.content;

            default: return "Unknown Protocol";
          }
        } catch (error: any) {
          console.error(`⚠️ ${modelId} Tier ${tierIndex} (${targetModel}) failed: ${error.message}`);
          return await executeWithFallback(tierIndex + 1);
        }
      };

      const responseText = await Promise.race([
        executeWithFallback(), 
        nodeTimeout(35000)
      ]) as string;
      
      rollingContext += `\n[${modelId} VERDICT]: ${responseText}\n`;
      finalResults.push({ model: modelId, response: responseText });
    }

    const newConversation = new Conversation({
      userId,
      prompt,
      results: finalResults,
      parentConversationId: parentConversationId || null,
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
