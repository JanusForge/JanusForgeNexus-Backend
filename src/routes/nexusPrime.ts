import express from 'express';
import Conversation from '../models/Conversation';
import { aiClients } from '../server'; // Accessing cluster from server

const router = express.Router();

// 🧠 STRATEGIC DIRECTIVE: Token Conservation & Style
const SYSTEM_DIRECTIVE = `
  You are part of the Janus Forge Nexus® Adversarial Cluster.
  STRATEGIC CONSTRAINT: Provide high-density, precise, and surgical responses. 
  Avoid encyclopedic fluff, redundant introductions, or filler text.
  Speak as your distinct persona, but prioritize "Information-per-Token" efficiency to conserve platform resources.
`;

// --- 1. NEURAL HISTORY: Fetch past syntheses ---
router.get('/history/:userId', async (req, res) => {
  try {
    const history = await Conversation.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(20);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve neural history" });
  }
});

// --- 2. RECONSTRUCTION: Fetch a single synthesis ---
router.get('/synthesis/:id', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    res.json(conv);
  } catch (err) {
    res.status(404).json({ error: "Synthesis not found" });
  }
});

// --- 3. IGNITION: The Adversarial Synthesis Sequence ---
router.post('/ignite', async (req, res) => {
  const { prompt, models, userId, parentConversationId } = req.body;

  if (!prompt || !models || models.length === 0) {
    return res.status(400).json({ error: "Incomplete ignition parameters." });
  }

  try {
    // A. RECALL: Fetch context if this is a follow-up
    let context = "";
    if (parentConversationId) {
      const previous = await Conversation.findById(parentConversationId);
      if (previous) {
        // Build a short summary of the previous turn for context
        context = `PREVIOUS CONTEXT: User asked: "${previous.prompt}". `;
        context += previous.results.map((r: any) => `${r.model} said: ${r.response.substring(0, 200)}...`).join(" ");
      }
    }

    // B. DISPATCH: Simultaneous Cluster Request
    const synthesisTasks = models.map(async (modelId: string) => {
      try {
        const fullPrompt = `${SYSTEM_DIRECTIVE}\n\n${context}\n\nCURRENT OBJECTIVE: ${prompt}`;
        let responseText = "";

        switch (modelId) {
          case 'CLAUDE':
            const msg = await (aiClients as any).CLAUDE.messages.create({
              model: "claude-3-5-sonnet-20240620",
              max_tokens: 1024,
              messages: [{ role: "user", content: fullPrompt }]
            });
            responseText = msg.content[0].text;
            break;
          case 'GPT4':
            const gptRes = await (aiClients as any).GPT4.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: fullPrompt }],
              max_tokens: 1000
            });
            responseText = gptRes.choices[0].message.content;
            break;
          case 'GEMINI':
            const geminiModel = (aiClients as any).GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
            const geminiRes = await geminiModel.generateContent(fullPrompt);
            responseText = geminiRes.response.text();
            break;
          case 'GROK':
            const grokRes = await (aiClients as any).GROK.chat.completions.create({
              model: "grok-2",
              messages: [{ role: "user", content: fullPrompt }]
            });
            responseText = grokRes.choices[0].message.content;
            break;
          case 'DEEPSEEK':
            const dsRes = await (aiClients as any).DEEPSEEK.chat.completions.create({
              model: "deepseek-chat",
              messages: [{ role: "user", content: fullPrompt }]
            });
            responseText = dsRes.choices[0].message.content;
            break;
        }

        return { model: modelId, response: responseText };
      } catch (err: any) {
        console.error(`Error in ${modelId}:`, err.message);
        return { model: modelId, response: null, error: "Protocol Desync" };
      }
    });

    const results = await Promise.all(synthesisTasks);

    // C. PERSISTENCE: Save to MongoDB
    const newConversation = new Conversation({
      userId,
      prompt,
      results,
      parentConversationId: parentConversationId || null,
      title: prompt.substring(0, 40) + "..."
    });

    await newConversation.save();

    res.json({
      conversationId: newConversation._id,
      results: newConversation.results
    });

  } catch (error) {
    console.error("Critical Synthesis Failure:", error);
    res.status(500).json({ error: "System-wide ignition failure." });
  }
});

export default router;
