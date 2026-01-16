import express from 'express';
const router = express.Router();
import crypto from 'crypto';
import Conversation from '../models/Conversation';

/**
 * 🎲 UTILITY: Fisher-Yates Shuffle
 * Ensures an unbiased random order for the AI Council sequence.
 */
function shuffleCouncil(array: string[]) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

router.post('/ignite', async (req, res) => {
  try {
    const { prompt, models, userId, parentConversationId } = req.body;
    const aiClients = req.app.get('aiClients');

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Strategic objective is required." });
    }

    // 1. MEMORY ARCHIVE: Load previous thread context
    let contextMessages: any[] = [];
    if (parentConversationId) {
      const thread = await Conversation.findById(parentConversationId);
      if (thread) {
        contextMessages.push({ role: "user", content: thread.prompt });
        thread.results.forEach((r: any) => {
          contextMessages.push({ role: "assistant", content: `${r.model} Output: ${r.response}` });
        });
      }
    }

    // 2. RANDOMIZE SEQUENCE: No single model leads every time
    const randomizedModels = shuffleCouncil(models);
    const currentSynthesisResults: any[] = [];
    
    // 3. SEQUENTIAL PEER-REVIEW LOOP
    for (const modelName of randomizedModels) {
      const peerContext = currentSynthesisResults
        .map(r => `[${r.model} Analysis]: ${r.response}`)
        .join('\n\n');
      
      const technicalDirective = peerContext 
        ? `Review the following peer analyses and provide your independent synthesis or counter-argument based on your unique design parameters:\n\n${peerContext}`
        : `You have been randomly selected to lead this synthesis. Initiate the analysis based on your core knowledge base.`;

      const finalPrompt = `${technicalDirective}\n\nArchitect Objective: ${prompt}`;

      try {
        const lowercaseModel = modelName.toLowerCase();

        if (lowercaseModel.includes('claude')) {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            messages: [...contextMessages, { role: "user", content: finalPrompt }],
          });
          currentSynthesisResults.push({ model: modelName, response: msg.content[0].text });
        }
        else if (lowercaseModel.includes('gpt')) {
          const completion = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [...contextMessages, { role: "user", content: finalPrompt }],
          });
          currentSynthesisResults.push({ model: modelName, response: completion.choices[0].message.content });
        }
        else if (lowercaseModel.includes('gemini')) {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
          const result = await model.generateContent(finalPrompt);
          currentSynthesisResults.push({ model: modelName, response: result.response.text() });
        }
        else if (lowercaseModel.includes('grok') || lowercaseModel.includes('deepseek')) {
          const client = lowercaseModel.includes('grok') ? aiClients.GROK : aiClients.DEEPSEEK;
          const completion = await client.chat.completions.create({
            model: lowercaseModel.includes('grok') ? "grok-beta" : "deepseek-chat",
            messages: [...contextMessages, { role: "user", content: finalPrompt }],
          });
          currentSynthesisResults.push({ model: modelName, response: completion.choices[0].message.content });
        }
      } catch (err) {
        currentSynthesisResults.push({ model: modelName, error: "Protocol Desync: Model unavailable." });
      }
    }

    // 4. PERSISTENCE
    const cleanTitle = prompt.trim().replace(/\n/g, ' ').substring(0, 45) + (prompt.length > 45 ? '...' : '');
    const newConversation = await Conversation.create({
      userId,
      prompt,
      results: currentSynthesisResults, // Saved in the random order they responded
      title: cleanTitle,
      type: 'NEXUS_PRIME',
      parentConversationId
    });

    res.status(200).json({ 
      success: true, 
      conversationId: newConversation._id, 
      results: currentSynthesisResults 
    });

  } catch (error) {
    res.status(500).json({ error: "Internal Synthesis Failure" });
  }
});

/**
 * RETRIEVAL & SHARING ROUTES
 */
router.get('/synthesis/:id', async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Retrieval failed." });
  }
});

router.get('/history/:userId', async (req, res) => {
  try {
    const history = await Conversation.find({ userId: req.params.userId, type: 'NEXUS_PRIME' }).sort({ timestamp: -1 });
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ error: "History sync failed." });
  }
});

router.post('/share/:id', async (req, res) => {
  try {
    const shareSlug = crypto.randomBytes(4).toString('hex');
    const conversation = await Conversation.findByIdAndUpdate(req.params.id, { isPublic: true, shareSlug }, { new: true });
    res.status(200).json({ success: true, shareUrl: `https://janusforgenexus-react.vercel.app/share/${shareSlug}` });
  } catch (error) {
    res.status(500).json({ error: "Sharing failed." });
  }
});

router.get('/public/:slug', async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ shareSlug: req.params.slug, isPublic: true });
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Public link error." });
  }
});

export default router;
