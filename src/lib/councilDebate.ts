// src/lib/councilDebate.ts
// Shared function for triggering AI council responses
// Called from both socket handlers (private chat) and REST endpoints (Daily Forge)

import prisma from './prisma';
import { Server as SocketIOServer } from 'socket.io';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface CouncilDebateParams {
  conversationId: string;
  io: SocketIOServer;
  currentTokens: number;
  deepseek: OpenAI;
  xai: OpenAI;
  genAI: GoogleGenerativeAI;
  anthropic: Anthropic;
}

type AIHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'failed';

interface AIHealth {
  status: AIHealthStatus;
  lastError: string | null;
}

export async function triggerCouncilDebate(params: CouncilDebateParams): Promise<void> {
  const { conversationId, io, currentTokens, deepseek, xai, genAI, anthropic } = params;

  console.log(`[Council] Starting debate for conversation ${conversationId}`);

  const councilDirective = `You are a member of the Janus Forge AI Council — a real-time multiversal debate forum.
Core Guidelines:
- Please respond directly to the most recent human query, external AI query, or AI Council Member point.
- Out of respect for time and resources, please recap or relitigate prior comments only if some of your points are important to the new comment you are making.
- You have full freedom of thought and expression.
- For dates/events: briefly note your knowledge cutoff date if relevant, or accept provided context.
- Please do your best to provide quality over quantity.
The council values epistemic humility, relevance, and respectful adversarial collaborative truth-seeking.`;

  const councilAIs = [
    {
      name: 'DEEPSEEK',
      client: deepseek,
      primary: 'deepseek-chat',
      fallback: 'deepseek-chat'
    },
    {
      name: 'GROK',
      client: xai,
      primary: 'grok-beta',
      fallback: 'grok-2-latest'
    },
    {
      name: 'GEMINI',
      client: genAI,
      primary: 'gemini-2.0-flash-exp',
      fallback: 'gemini-1.5-flash'
    },
    {
      name: 'CLAUDE',
      client: anthropic,
      primary: 'claude-sonnet-4-20250514',
      fallback: 'claude-sonnet-4-20241022'
    }
  ];

  const aiHealth = new Map<string, AIHealth>(
    councilAIs.map(ai => [ai.name, { status: 'unknown', lastError: null }])
  );

  const TRANSCRIPT_LIMIT = 30;

  let transcript = await prisma.post.findMany({
    where: { conversation_id: conversationId },
    orderBy: { created_at: 'asc' },
    take: TRANSCRIPT_LIMIT,
    include: { user: true }
  });

  for (const ai of councilAIs) {
    let aiContent = "";
    let finalLabel = ai.name;
    let usedFallback = false;

    const attemptGeneration = async (model: string, isFallback = false): Promise<string> => {
      const context = transcript.map(p => {
        const name = p.is_human 
          ? (p.user?.username || 'User') 
          : (p.ai_model || 'Council Member');
        return `${name}: ${p.content}`;
      }).join("\n\n") + "\n\nRespond concisely with substantive contribution.";

      try {
        if (ai.name === 'DEEPSEEK' || ai.name === 'GROK') {
          const res = await ai.client.chat.completions.create({
            model: model,
            messages: [
              { role: "system", content: councilDirective },
              { role: "user", content: context }
            ],
            temperature: 0.7,
            max_tokens: 800
          });
          const content = res?.choices?.[0]?.message?.content;
          if (!content) throw new Error('No content in response');
          return content;

        } else if (ai.name === 'GEMINI') {
          const generativeModel = ai.client.getGenerativeModel({
            model: model,
            systemInstruction: councilDirective
          });
          const res = await generativeModel.generateContent(context);
          const content = res?.response?.text();
          if (!content) throw new Error('No content in response');
          return content;

        } else if (ai.name === 'CLAUDE') {
          const res = await ai.client.messages.create({
            model: model,
            max_tokens: 800,
            system: councilDirective,
            messages: [{ role: "user", content: context }]
          });
          const content = res?.content?.[0]?.text;
          if (!content) throw new Error('No content in response');
          return content;
        }
        
        throw new Error('Unknown AI type');
        
      } catch (err: any) {
        console.error(`[${ai.name}/${model}] Attempt failed:`, err.message);
        throw err;
      }
    };

    try {
      // Primary attempt
      aiContent = await attemptGeneration(ai.primary);
      aiHealth.set(ai.name, { status: 'healthy', lastError: null });

    } catch (primaryErr: any) {
      aiHealth.set(ai.name, { status: 'degraded', lastError: primaryErr.message });
      console.warn(`[${ai.name}] Primary model failed, attempting fallback...`);

      // Fallback attempt
      try {
        aiContent = await attemptGeneration(ai.fallback, true);
        usedFallback = true;
        finalLabel = `${ai.name}-fallback`;
        console.log(`[${ai.name}] Fallback succeeded`);

      } catch (fallbackErr: any) {
        // Mark as failed
        aiHealth.set(ai.name, { status: 'failed', lastError: fallbackErr.message });
        aiContent = `[${ai.name} unavailable - query redistributed to council]`;
        finalLabel = `System-${ai.name}-failed`;
        console.error(`[${ai.name}] Both primary and fallback failed`);
      }
    }

    // Save and emit response
    if (aiContent && aiContent.trim()) {
      try {
        const aiPost = await prisma.post.create({
          data: {
            content: aiContent,
            is_human: false,
            ai_model: finalLabel,
            conversation_id: conversationId,
            metadata: {
              usedFallback,
              health: Object.fromEntries(aiHealth),
              timestamp: new Date().toISOString()
            }
          }
        });

        io.to(conversationId).emit('post:incoming', {
          id: aiPost.id,
          name: finalLabel,
          content: aiContent,
          sender: 'ai',
          tokens_remaining: currentTokens,
          isFallback: usedFallback,
          health: aiHealth.get(ai.name),
          created_at: aiPost.created_at
        });

        console.log(`[${finalLabel}] ${usedFallback ? 'Fallback ' : ''}Response saved (${aiContent.length} chars)`);

        // Delay before next AI to prevent race conditions
        await new Promise(r => setTimeout(r, 1500));

      } catch (dbErr: any) {
        console.error(`[${ai.name}] Database save failed:`, dbErr.message);
      }
    }

    // Refresh transcript after each AI response
    try {
      transcript = await prisma.post.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: 'asc' },
        take: TRANSCRIPT_LIMIT,
        include: { user: true }
      });
    } catch (refreshErr: any) {
      console.error('[Council] Transcript refresh failed:', refreshErr.message);
      // Continue with existing transcript if refresh fails
    }
  }

  // Report on council health
  const healthReport = Array.from(aiHealth.entries()).map(([name, health]) => ({
    ai: name,
    status: health.status,
    error: health.lastError
  }));

  const failedAIs = healthReport.filter(h => h.status === 'failed');
  const degradedAIs = healthReport.filter(h => h.status === 'degraded');

  if (failedAIs.length > 0) {
    console.warn(`[Council] ${failedAIs.length} member(s) failed:`,
      failedAIs.map(a => a.ai).join(', '));
  }

  if (degradedAIs.length > 0) {
    console.info(`[Council] ${degradedAIs.length} member(s) used fallback:`,
      degradedAIs.map(a => a.ai).join(', '));
  }

  console.log('[Council] Debate round complete', {
    conversationId,
    total: councilAIs.length,
    healthy: healthReport.filter(h => h.status === 'healthy').length,
    degraded: degradedAIs.length,
    failed: failedAIs.length
  });
}
