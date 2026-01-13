import prisma from './lib/prisma';
import { triggerCouncilDebate } from './lib/councilDebate';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

// Initialize local clients for the test
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

const aiClients = { deepseek, xai, genAI, anthropic };

async function testForgeDebate() {
  console.log("🧪 Starting Self-Contained Forge Test...");

  let testConvo = await prisma.conversation.findFirst({
    where: { title: "Test Debate" }
  });

  if (!testConvo) {
    testConvo = await prisma.conversation.create({
      data: {
        title: "Test Debate",
        is_daily_forge: true,
      }
    });
  }

  console.log(`✅ Using Conversation ID: ${testConvo.id}`);

  const mockIo = {
    to: (id: string) => ({
      emit: (event: string, data: any) => {
        console.log(`📡 [Socket] ${data.name} -> ${data.content.substring(0, 100)}...`);
      }
    })
  } as any;

  await triggerCouncilDebate({
    conversationId: testConvo.id,
    io: mockIo,
    currentTokens: 999,
    ...aiClients
  });

  console.log("🏁 Test Complete!");
}

testForgeDebate().catch(console.error);
