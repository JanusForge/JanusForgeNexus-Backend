// src/routes/conversations.ts
// Handles REST API for Daily Forge interjections (public viewing, authenticated posting)

import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

// GET /api/conversations/:conversationId
// Public endpoint - anyone can view Daily Forge conversations
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        posts: {
          include: { user: true },
          orderBy: { created_at: 'asc' }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation });
  } catch (error: any) {
    console.error('GET /conversations/:conversationId error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// POST /api/conversations/:conversationId/posts
// Protected endpoint - requires authentication + tokens
// Used by Daily Forge for interjections
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human, isLiveChat } = req.body;

    // Validate input
    if (!content || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: content, userId' 
      });
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get user and check authentication
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isGodMode = user.role === 'GOD_MODE';
    const hasTokenBypass = isGodMode;

    // Check token balance
    if (!hasTokenBypass && user.tokens_remaining < 1) {
      return res.status(403).json({ 
        error: 'Insufficient tokens',
        message: 'You need at least 1 token to interject. Please purchase tokens first.'
      });
    }

    // Create post and decrement tokens in a transaction
    const [post, updatedUser] = await prisma.$transaction(async (tx) => {
      // Decrement tokens if not god mode
      if (!hasTokenBypass) {
        await tx.user.update({
          where: { id: userId },
          data: { tokens_remaining: { decrement: 1 } }
        });
      }

      // Create the post
      const newPost = await tx.post.create({
        data: {
          content,
          is_human: is_human !== false, // Default to true
          user_id: userId,
          conversation_id: conversationId
        },
        include: { user: true }
      });

      // Get updated user
      const refreshedUser = await tx.user.findUnique({ 
        where: { id: userId } 
      });
      
      return [newPost, refreshedUser];
    });

    const currentTokens = hasTokenBypass ? 999999 : updatedUser!.tokens_remaining;

    // Get io instance from app
    const io = req.app.get('io');
    const aiClients = req.app.get('aiClients');
    
    // Emit user's post to room (for real-time updates)
    io.to(conversationId).emit('post:incoming', {
      id: post.id,
      name: user.username,
      content: post.content,
      sender: 'user',
      role: user.role,
      tokens_remaining: currentTokens,
      created_at: post.created_at
    });

    console.log(`[Daily Forge] User ${user.username} posted to ${conversationId}`);

    // Send immediate response to user
    res.status(201).json({
      success: true,
      post: {
        id: post.id,
        content: post.content,
        created_at: post.created_at,
        is_human: post.is_human
      },
      tokens_remaining: currentTokens,
      message: 'Interjection posted! AI council will respond shortly.'
    });

    // **TRIGGER AI COUNCIL DEBATE** (async, doesn't block response)
    // This is the key part that makes the AIs respond to Daily Forge interjections
    triggerCouncilDebate({
      conversationId,
      io,
      currentTokens,
      deepseek: aiClients.deepseek,
      xai: aiClients.xai,
      genAI: aiClients.genAI,
      anthropic: aiClients.anthropic
    }).catch(err => {
      console.error('[Daily Forge] Council debate error:', err);
      // Emit error to room so frontend knows something went wrong
      io.to(conversationId).emit('council:error', {
        message: 'AI council encountered an error responding to your interjection',
        details: err.message
      });
    });

  } catch (error: any) {
    console.error('POST /conversations/:conversationId/posts error:', error);
    res.status(500).json({ 
      error: 'Failed to create post', 
      details: error.message 
    });
  }
});

export default router;
