import express from 'express';
import prisma from '../lib/prisma';
import Conversation from '../models/Conversation';
import { aiClients } from '../server';

const router = express.Router();

// 🧠 THE ADVERSARIAL CONSTITUTION
// This directive forces the AIs to be combative and address each other by name.
const SYSTEM_DIRECTIVE = `
  You are an ELITE ADVERSARIAL AGENT in the Janus Forge Nexus®.
  CORE RULES:
  1. ADVERSARIAL ENGAGEMENT: Do not be generally helpful. Deconstruct, challenge, or pivot the arguments of agents who spoke before you.
  2. IDENTIFICATION: Refer to previous agents by their Model Name (e.g., "Grok's premise is flawed because...") to maintain debate clarity.
  3. SURGICAL BREVITY: Max 3 paragraphs. Focus on "Information-per-Token" density.
  4. OPENING GAMBIT: If you are the first to speak, set a high-stakes, aggressive strategic floor for the debate.
`;

const nodeTimeout = (ms: number) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Node Latency Timeout")), ms)
);

// --- 1. THE IGNITION HUB ---
router.post('/ignite', async (req, res) => {
  const { prompt, models, userId, parentConversationId } = req.body;

  if (!prompt || !models || models.length === 0 || !userId) {
    return res.status(400).json({ error: "Ignition parameters missing." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User Not Found." });

    // 🛡️ AUTHORITY & SOVEREIGNTY BYPASS
    // GOD_MODE and ADMIN bypass the access_expiry check entirely.
    const isMasterAuthority = user.role === 'GOD_MODE' || user.role === 'ADMIN' || user.role === 'BETA_ARCHITECT';
    const now = new Date();
    const hasActivePass = user.access_expiry && now < user.access_expiry;

    if (!isMasterAuthority && !hasActivePass) {
      return res.status(403).json({ 
        error: "Sovereignty Expired",
        message: "Your access window has closed. Refuel at the Council Portal."
      });
    }

    // 🎲 FISHER-YATES SHUFFLE: Randomize who speaks first to keep the Forge unpredictable
    const speakerOrder = [...models];
    for (let i = speakerOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [speakerOrder[i], speakerOrder[j]] = [speakerOrder[j], speakerOrder[i]];
    }

    // ⛓️ SEQUENTIAL DEBATE LOOP
    // Each AI receives the responses of the AIs that came before it.
    let rollingContext = "";
    const finalResults: any[] = [];

    for (const modelId of speakerOrder) {
      const modelPrompt = `
        ${SYSTEM_DIRECTIVE}
        
        ### PREVIOUS NEURAL VERDICTS IN THIS SESSION:
        ${rollingContext || "You are the Opening Gambit. Define the conflict."}
        
        ### CURRENT STRATEGIC OBJECTIVE:
        "${prompt}"
        
        INSTRUCTION: Critique the specific logic of the agents listed above before finalizing your own verdict.
      `;

      const executeAI = async () => {
        try {
          switch (modelId) {
            case 'CLAUDE':
              const cMsg = await (aiClients as any).CLAUDE.messages.create({
                model: "claude-3-5-sonnet-20241022", // Updated 2026 Stable Tier
                max_tokens: 450,
                messages: [{ role: "user", content: modelPrompt }]
              });
              return cMsg.content[0].text;

            case 'GPT4':
              const gRes = await (aiClients as any).GPT4.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: modelPrompt }],
                max_tokens: 450
              });
              return gRes.choices[0].message.content;

            case 'GEMINI':
              const gemModel = (aiClients as any).GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
              const gemRes = await gemModel.generateContent(modelPrompt);
              return gemRes.response.text();

            case 'GROK':
              const grRes = await (aiClients as any).GROK.chat.completions.create({
                model: "grok-2-latest", // Updated from deprecated grok-beta
                messages: [{ role: "user", content: modelPrompt }],
                max_tokens: 450
              });
              return grRes.choices[0].message.content;

            case 'DEEPSEEK':
              const dRes = await (aiClients as any).DEEPSEEK.chat.completions.create({
                model: "deepseek-chat",
                messages: [{ role: "user", content: modelPrompt }],
                max_tokens: 450
              });
              return dRes.choices[0].message.content;

            default: return "Unknown Protocol";
          }
        } catch (e: any) {
          console.error(`Error at ${modelId}:`, e.message);
          return `${modelId} NODE OFFLINE: ${e.message}`;
        }
      };

      // We wait for the AI to respond so its output is available to the next model
      const responseText = await Promise.race([executeAI(), nodeTimeout(25000)]) as string;
      
      // Update the rolling history for the next agent in the loop
      rollingContext += `\n[${modelId} VERDICT]: ${responseText}\n`;
      
      finalResults.push({ model: modelId, response: responseText });
    }

    // 💾 PERSIST CONVERSATION
    const newConversation = new Conversation({
      userId,
      prompt,
      results: finalResults,
      parentConversationId: parentConversationId || null,
      title: prompt.substring(0, 35) + "..."
    });

    await newConversation.save();

    res.json({
      conversationId: newConversation._id,
      results: newConversation.results
    });

  } catch (error) {
    console.error("Critical Engine Failure:", error);
    res.status(500).json({ error: "Ignition system failure." });
  }
});

// --- 2. NEURAL HISTORY ---
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

// --- 3. RECONSTRUCTION ---
router.get('/synthesis/:id', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    res.json(conv);
  } catch (err) {
    res.status(404).json({ error: "Synthesis Not Found" });
  }
});

export default router;
