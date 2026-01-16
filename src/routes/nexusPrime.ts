import express from 'express';
const router = express.Router();
import crypto from 'crypto';
import Conversation from '../models/Conversation';

/**
 * 🚀 JANUS FORGE NEXUS ®: PRIME IGNITION
 */
router.post('/ignite', async (req, res) => {
  try {
    const { prompt, models, userId } = req.body;
    const aiClients = req.app.get('aiClients');

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Strategic objective is required." });
    }

    // Parallel Execution across selected models
    const requests = models.map(async (modelName: string) => {
      try {
        if (modelName.includes('Claude')) {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          });
          return { model: modelName, response: msg.content[0].text };
        }

        if (modelName.includes('GPT')) {
          const completion = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "user", content: prompt }],
          });
          return { model: modelName, response: completion.choices[0].message.content };
        }

        return { model: modelName, response: "Model interface pending integration." };
      } catch (err) {
        return { model: modelName, error: "Failed to synchronize." };
      }
    });

    const results = await Promise.all(requests);

    // 🛡️ PROFESSIONAL RECOMMENDATION: Title Sanitization
    // Removes newlines and extra spaces, then caps at 45 chars for better sidebar fit
    const cleanTitle = prompt.trim().replace(/\n/g, ' ').substring(0, 45) + (prompt.length > 45 ? '...' : '');

    // PERSISTENCE: Save to MongoDB
    const newConversation = await Conversation.create({
      userId,
      prompt,
      results,
      title: cleanTitle,
      type: 'NEXUS_PRIME',
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      conversationId: newConversation._id,
      results: results,
      title: cleanTitle
    });

  } catch (error: any) {
    console.error("❌ Nexus Prime Ignition Error:", error);
    res.status(500).json({ 
        error: "Internal Prime Cluster Failure",
        details: error.message 
    });
  }
});

/**
 * 📂 HISTORY RETRIEVAL: Specifically for Nexus Prime
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const history = await Conversation.find({
      userId: req.params.userId,
      type: 'NEXUS_PRIME'
    }).sort({ timestamp: -1 });

    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ error: "Could not retrieve Neural History." });
  }
});

/**
 * 🌎 PUBLIC SHARING: Generates a public slug
 */
router.post('/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const shareSlug = crypto.randomBytes(4).toString('hex');

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      { isPublic: true, shareSlug: shareSlug },
      { new: true }
    );

    if (!conversation) return res.status(404).json({ error: "Strategic link not found." });

    res.status(200).json({
      success: true,
      shareUrl: `https://janusforgenexus-react.vercel.app/share/${shareSlug}`
    });
  } catch (error) {
    res.status(500).json({ error: "Sharing protocol failure." });
  }
});

/**
 * 🔓 PUBLIC VIEW: Fetches synthesis by slug
 */
router.get('/public/:slug', async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      shareSlug: req.params.slug,
      isPublic: true
    });
    if (!conversation) return res.status(404).json({ error: "Link invalid." });
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Retrieval error." });
  }
});

/**
 * 🛰️ NEURAL RETRIEVAL: Fetches a single synthesis by ID
 */
router.get('/synthesis/:id', async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Synthesis not found in the archive." });
    }
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Neural retrieval failed." });
  }
});

export default router;
