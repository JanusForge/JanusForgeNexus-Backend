// src/lib/councilDebate.ts
import prisma from './prisma';
import { Server as SocketIOServer } from 'socket.io';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIParticipant } from '@prisma/client';

interface CouncilDebateParams {
  conversationId: string;
  io: SocketIOServer;
  currentTokens: number;
  deepseek: OpenAI;
  xai: OpenAI;
  genAI: GoogleGenerativeAI;
  anthropic: Anthropic;
}

export async function triggerCouncilDebate(params: CouncilDebateParams): Promise<void> {
  const { conversationId, io, currentTokens, deepseek, xai, genAI, anthropic } = params;

  console.log(`[Council] Initiating 2026 Synthesis for: ${conversationId}`);

  const councilDirective = `You are a member of the Janus Forge AI Council.
  Respond directly and concisely to the current state of the debate.
  Contribute unique perspective or adversarial challenge.
  Keep responses substantive but under 800 tokens.`;

  const openaiStandard = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const councilAIs = [
    {
      name: AIParticipant.DEEPSEEK,
      client: deepseek,
      model: 'deepseek-reasoner', 
    },
    {
      name: AIParticipant.GROK,
      client: xai,
      model: 'grok-4',
    },
    {
      name: AIParticipant.CHATGPT,
      client: openaiStandard,
      model: 'gpt-5', 
    },
    {
      name: AIParticipant.GEMINI_PRO,
      client: genAI,
      model: 'gemini-2.5-pro', // 2026 Production Stable
    },
    {
      name: AIParticipant.CLAUDE,
      client: anthropic,
      model: 'claude-sonnet-4-5', // 2026 Production Stable
    }
  ];

  const TRANSCRIPT_LIMIT = 20;

  for (const ai of councilAIs) {
    try {
      const transcript = await prisma.post.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: 'asc' },
        take: TRANSCRIPT_LIMIT,
        include: { user: true }
      });

      const context = transcript.map(p => {
        const author = p.is_human ? (p.user?.username || 'User') : (p.ai_model || 'Council');
        return `${author}: ${p.content}`;
      }).join("\n\n");

      let aiContent = "";

      if ([AIParticipant.DEEPSEEK, AIParticipant.GROK, AIParticipant.CHATGPT].includes(ai.name)) {
        // 2026 Reasoning Logic: GPT-5 and DeepSeek Reasoner often fail if temperature is set.
        const isReasoningModel = ai.name === AIParticipant.CHATGPT || ai.model.includes('reasoner');
        
        const res = await (ai.client as OpenAI).chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: councilDirective },
            { role: "user", content: context }
          ],
          // Only include temperature if it's NOT a restricted reasoning model
          ...(!isReasoningModel && { temperature: 0.7 })
        });
        aiContent = res.choices[0]?.message?.content || "";

      } else if (ai.name === AIParticipant.GEMINI_PRO) {
        // Fix: Force version 'v1' by modifying the client if necessary, or just use stable model
        const model = (ai.client as GoogleGenerativeAI).getGenerativeModel({ model: ai.model });
        const result = await model.generateContent(`${councilDirective}\n\nContext:\n${context}`);
        aiContent = result.response.text();

      } else if (ai.name === AIParticipant.CLAUDE) {
        const res = await (ai.client as Anthropic).messages.create({
          model: ai.model,
          max_tokens: 1000,
          system: councilDirective,
          messages: [{ role: "user", content: context }]
        });
        aiContent = (res.content[0] as any).text || "";
      }

      if (!aiContent.trim()) continue;

      const savedPost = await prisma.post.create({
        data: {
          content: aiContent,
          is_human: false,
          ai_model: ai.name,
          conversation_id: conversationId
        }
      });

      io.to(conversationId).emit('post:incoming', {
        id: savedPost.id,
        name: ai.name,
        content: aiContent,
        sender: 'ai',
        tokens_remaining: currentTokens,
        created_at: savedPost.created_at,
        conversationId
      });

      await new Promise(r => setTimeout(r, 2000));

    } catch (err: any) {
      console.error(`[Council Error] ${ai.name} failed:`, err.message);
    }
  }
}
