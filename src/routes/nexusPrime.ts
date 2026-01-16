\import express from 'express';
import Conversation from '../models/Conversation';
import { aiClients } from '../server';

const router = express.Router();

const SYSTEM_DIRECTIVE = `
  You are part of the Janus Forge Nexus® Adversarial Cluster.
  STRATEGIC CONSTRAINT: Maximum 3 paragraphs. Be surgical and adversarial.
  No filler or conversational fluff. Prioritize token efficiency.
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

// --- 2. RECONSTRUCTION (Single view for sync) ---
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
    // ✅ NEURAL THREADING: Fetch previous context
    let context = "";
    if (parentConversationId) {
      const thread = await Conversation.find({
        $or: [{ _id: parentConversationId }, { parentConversationId: parentConversationId }]
      }).sort({ timestamp: -1 }).limit(2);

      if (thread.length > 0) {
        context = "--- ARCHIVAL CONTEXT ---\n";
        thread.reverse().forEach(turn => {
          context += `User: ${turn.prompt}\nCluster Consensus: ${turn.results[0]?.response?.substring(0, 150)}...\n`;
        });
        context += "--- END CONTEXT ---\n";
      }
    }

    const synthesisTasks = models.map(async (modelId: string) => {
      const fullPrompt = `${SYSTEM_DIRECTIVE}\n\n${context}\n\nNEW OBJECTIVE: ${prompt}`;

      const executeAI = async () => {
        try {
          switch (modelId) {
            case 'CLAUDE':
              const cMsg = await (aiClients as any).CLAUDE.messages.create({
                model: "claude-3-5-sonnet-20240620",
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
        } catch (e: any) {
          console.error(`AI Error [${modelId}]:`, e.message);
          return `${modelId} NODE ERROR: ${e.message}`;
        }
      };

      try {
        const responseText = await Promise.race([executeAI(), nodeTimeout(12000)]) as string;
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
