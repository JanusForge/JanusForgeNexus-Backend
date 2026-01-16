import express from 'express';
const router = express.Router();
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto'; // ✅ Added for secure slug generation
import Conversation from '../models/Conversation';

// ... (ignite and history routes remain unchanged) ...

/**
 * 🌎 PUBLIC SHARING: Generates a public slug for a synthesis
 */
router.post('/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Generate a unique 8-character hex string for the shareable URL
    const shareSlug = crypto.randomBytes(4).toString('hex');

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      { 
        isPublic: true, 
        shareSlug: shareSlug 
      },
      { new: true }
    );

    if (!conversation) return res.status(404).json({ error: "Strategic link not found." });

    res.status(200).json({ 
      success: true, 
      shareUrl: `https://janusforgenexus-react.vercel.app/share/${shareSlug}` 
    });
  } catch (error) {
    console.error("❌ Sharing Protocol Error:", error);
    res.status(500).json({ error: "Sharing protocol failure." });
  }
});

/**
 * 🔓 PUBLIC VIEW: Fetches synthesis by slug (No Auth Required)
 */
router.get('/public/:slug', async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ 
      shareSlug: req.params.slug, 
      isPublic: true 
    });

    if (!conversation) {
      return res.status(404).json({ error: "Public synthesis link is invalid or expired." });
    }
    
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Neural link retrieval error." });
  }
});

export default router;
