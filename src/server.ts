// src/server.ts

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Initialize the Brains
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const grok = new OpenAI({ 
  apiKey: process.env.XAI_API_KEY, 
  baseURL: "https://api.x.ai/v1" 
});

socket.on('post:new', async (postData) => {
  // Relay human message immediately
  io.emit('post:incoming', {
    id: `user-${Date.now()}`,
    sender: 'user',
    name: postData.name || 'admin-access',
    content: postData.content,
    tier: postData.tier || 'basic'
  });

  try {
    // --- STEP 1: Gemini (The Initial Synthesis) ---
    const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const geminiResult = await geminiModel.generateContent(`You are Councilor GEMINI. Analyze this user input: "${postData.content}". Keep it concise and provocative.`);
    const geminiText = geminiResult.response.text();

    io.emit('ai:response', {
      id: `ai-gemini-${Date.now()}`,
      sender: 'ai',
      name: 'Councilor GEMINI',
      avatar: '🌟',
      content: geminiText,
      tier: 'enterprise'
    });

    // --- STEP 2: Claude (The Counter-Perspective) ---
    // Claude sees what Gemini said and reacts to it!
    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 300,
      messages: [{ 
        role: "user", 
        content: `You are Councilor CLAUDE. The human said: "${postData.content}". Councilor GEMINI argued: "${geminiText}". Debate Gemini's point directly.` 
      }],
    });

    io.emit('ai:response', {
      id: `ai-claude-${Date.now()}`,
      sender: 'ai',
      name: 'Councilor CLAUDE',
      avatar: '🧬',
      content: claudeResponse.content[0].text,
      tier: 'pro'
    });

    // --- STEP 3: Grok (The Disruptor) ---
    const grokResponse = await grok.chat.completions.create({
      model: "grok-beta",
      messages: [
        { role: "system", content: "You are Councilor GROK. You are edgy and disruptive." },
        { role: "user", content: `The human just triggered a debate between GEMINI and CLAUDE. Gemini said: "${geminiText}". Claude countered with: "${claudeResponse.content[0].text}". Give us the unfiltered reality.` }
      ],
    });

    io.emit('ai:response', {
      id: `ai-grok-${Date.now()}`,
      sender: 'ai',
      name: 'Councilor GROK',
      avatar: '🏴‍☠️',
      content: grokResponse.choices[0].message.content,
      tier: 'enterprise'
    });

  } catch (error) {
    console.error("Council Synchronicity Error:", error);
  }
});
