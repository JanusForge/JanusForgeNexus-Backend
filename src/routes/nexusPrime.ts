import express from 'express';
import prisma from '../lib/prisma';
import Conversation from '../models/Conversation';
import { aiClients } from '../server';

const router = express.Router();

// 🧠 STRATEGIC DIRECTIVE: Force Adversarial Engagement
const SYSTEM_DIRECTIVE = `
  You are an ELITE ADVERSARIAL AGENT in the Janus Forge Nexus®.
  CORE RULES:
  1. DO NOT be general. Challenge the previous verdicts.
  2. Speak with a sharp, surgical persona.
  3. Max 3 paragraphs. Focus on "Information-per-Token" density.
`;

const nodeTimeout = (ms: number) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Node Latency Timeout")), ms)
);

// --- 1. THE IGNITION HUB (With Authority Bypass) ---
router.post('/ignite', async (req, res) => {
  const { prompt, models, userId, parentConversationId } = req.body;

  if (!prompt || !models || models.length === 0 || !userId) {
    return res.status(400).json({ error: "Ignition parameters missing." });
  }

  try {
    // 🛡️ STEP 3: SOVEREIGNTY ACCESS & ROLE GUARD
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(401).json({ error: "User Not Found." });
    }

    // ✅ THE BYPASS: If user is GOD_MODE or ADMIN, skip the clock check
    const isMasterAuthority = user.role === 'GOD_MODE' || user.role === 'ADMIN' || user.role === 'BETA_ARCHITECT';
    const now = new Date();
    const hasActivePass = user.access_expiry && now < user.access_expiry;

    if (!isMasterAuthority && !hasActivePass) {
      return res.status(403).json({ 
        error: "Sovereignty Expired",
        message: "Your access window has closed. Refuel at the Council Portal."
      });
    }

    // ✅ PROCEED TO SYNTHESIS
    let contextHeader = "";
    if (parentConversationId) {
      const previous = await Conversation.findById(parentConversationId);
      if (previous) {
        contextHeader = `### PREVIOUS ADVERSARIAL VERDICTS\n`;
        previous.results.forEach((r: any) => {
          if (r.response) contextHeader += `[${r.model} VERDICT]: ${r.response.substring(0, 300)}...\n\n`;
        });
      }
    }

    const synthesisTasks = models.map(async (modelId: string) => {
      const fullPrompt = `${SYSTEM_DIRECTIVE}\n\n${contextHeader}\n\n### OBJECTIVE\n"${prompt}"`;

      const executeAI = async () => {
        try {
          switch (modelId) {
            case 'CLAUDE':
              const cMsg = await (aiClients as any).CLAUDE.messages.create({
                model: "claude-3-5-sonnet-latest",
                max_tokens: 450,
                messages: [{ role: "user", content: fullPrompt }]
              });
              return cMsg.content[0].text;

            case 'GPT4':
              const gRes = await (aiClients as any).GPT4.chat.completions.create({
                model: "gpt-4o", 
                messages: [{ role: "user", content: fullPrompt }],
                max_tokens: 450
              });
              return gRes.choices[0].message.content;

            case 'GEMINI':
              const gemModel = (aiClients as any).GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
              const gemRes = await gemModel.generateContent(fullPrompt);
              return gemRes.response.text();

            case 'GROK':
              const grRes = await (aiClients as any).GROK.chat.completions.create({
                model: "grok-beta",
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
        } catch (e: any) {
          return `${modelId} NODE OFFLINE: ${e.message}`;
        }
      };

      try {
        const responseText = await Promise.race([executeAI(), nodeTimeout(15000)]) as string;
        return { model: modelId, response: responseText };
      } catch (err) {
        return { model: modelId, response: "PROTOCOL TIMEOUT" };
      }
    });

    const results = await Promise.all(synthesisTasks);

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
    res.status(500).json({ error: "Ignition system failure." });
  }
});

// --- Neural History & Synthesis remain unchanged ---
router.get('/history/:userId', async (req, res) => {
    try {
      const history = await Conversation.find({ userId: req.params.userId }).sort({ timestamp: -1 }).limit(15);
      res.json(history);
    } catch (err) { res.status(500).json({ error: "Neural History Desync" }); }
});

router.get('/synthesis/:id', async (req, res) => {
    try {
      const conv = await Conversation.findById(req.params.id);
      res.json(conv);
    } catch (err) { res.status(404).json({ error: "Synthesis Not Found" }); }
});

export default router;
