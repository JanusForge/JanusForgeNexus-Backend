import express from 'express';
import Conversation from '../models/Conversation';
import { aiClients } from '../server';

const router = express.Router();

// 🧠 STRATEGIC DIRECTIVE: Force Adversarial Engagement & Efficiency
const SYSTEM_DIRECTIVE = `
  You are an ELITE ADVERSARIAL AGENT in the Janus Forge Nexus®.
  CORE RULES:
  1. DO NOT be general or encyclopedic. 
  2. You MUST directly address, challenge, or support the specific points made by other models in the PREVIOUS VERDICTS.
  3. Speak with a distinct, sharp, and surgical persona.
  4. Max 3 paragraphs. Focus on "Information-per-Token" density.
`;

const nodeTimeout = (ms: number) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Node Latency Timeout")), ms)
);

// --- 1. NEURAL HISTORY (List view) ---
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

// --- 2. RECONSTRUCTION (Single view for UI sync) ---
router.get('/synthesis/:id', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    res.json(conv);
  } catch (err) {
    res.status(404).json({ error: "Synthesis Not Found" });
  }
});

// --- 3. IGNITION ---
router.post('/ignite', async (req, res) => {
  const { prompt, models, userId, parentConversationId } = req.body;

  if (!prompt || !models || models.length === 0) {
    return res.status(400).json({ error: "Ignition parameters missing." });
  }

  try {
    // ✅ DEEP NEURAL THREADING: Labeling specific model outputs for Turn 2
    let contextHeader = "";
    if (parentConversationId) {
      const previous = await Conversation.findById(parentConversationId);
      if (previous) {
        contextHeader = `### PREVIOUS ADVERSARIAL VERDICTS (Turn 1)\n`;
        previous.results.forEach((r: any) => {
          if (r.response) {
            contextHeader += `[${r.model} VERDICT]: ${r.response.substring(0, 400)}...\n\n`;
          }
        });
        contextHeader += `--- END OF HISTORY ---\n`;
      }
    }

    const synthesisTasks = models.map(async (modelId: string) => {
      // The prompt is structured to put the Objective and Context at the bottom (Recency Bias)
      const fullPrompt = `
        ${SYSTEM_DIRECTIVE}
        
        ${contextHeader}
        
        ### CURRENT STRATEGIC OBJECTIVE
        Objective: "${prompt}"
        
        INSTRUCTION: Focus your response specifically on refuting or expanding upon the [VERDICTS] provided above.
      `;

      const executeAI = async () => {
        try {
          switch (modelId) {
            case 'CLAUDE':
              const cMsg = await (aiClients as any).CLAUDE.messages.create({
                model: "claude-3-5-sonnet-latest", // ⚡ 2026 Stable
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
              // ⚡ Google 2026 Stable Tier
              const gemModel = (aiClients as any).GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
              const gemRes = await gemModel.generateContent(fullPrompt);
              return gemRes.response.text();

            case 'GROK':
              const grRes = await (aiClients as any).GROK.chat.completions.create({
                model: "grok-beta", // ⚡ xAI 2026 Stable Beta
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
          console.error(`AI Error [${modelId}]:`, e.message);
          return `${modelId} NODE OFFLINE: ${e.message}`;
        }
      };

      try {
        const responseText = await Promise.race([executeAI(), nodeTimeout(15000)]) as string;
        return { model: modelId, response: responseText };
      } catch (err) {
        return { model: modelId, response: "PROTOCOL TIMEOUT: Node Unresponsive." };
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
    console.error("Critical Failure:", error);
    res.status(500).json({ error: "Ignition system failure." });
  }
});

export default router;
