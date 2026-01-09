import prisma from '../lib/prisma';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Initialize AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function runCouncilWorkflow() {
  console.log("🏛️ Council Workflow starting...");

  try {
    // 1. Find today's forge in TOPIC_SELECTION
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const forge = await prisma.dailyForge.findFirst({
      where: {
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        },
        phase: 'TOPIC_SELECTION'
      }
    });

    if (!forge) {
      console.log("🤷 No forge in TOPIC_SELECTION phase found");
      return;
    }

    console.log(`🎯 Found forge: ${forge.id}`);
    const topics = JSON.parse(forge.scoutedTopics);
    console.log(`📋 Topics to vote on: ${topics.length}`);

    // 2. Get council votes on topics
    const votes = await getCouncilVotes(topics);
    
    // 3. Determine winning topic
    const voteCounts: Record<string, number> = {};
    Object.values(votes).forEach(vote => {
      voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    });

    let winningTopic = '';
    let maxVotes = 0;
    Object.entries(voteCounts).forEach(([topic, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        winningTopic = topic;
      }
    });

    // If tie or error, pick first topic
    if (!winningTopic && topics.length > 0) {
      winningTopic = topics[0].title;
    }

    console.log(`🏆 Winning topic: ${winningTopic}`);
    console.log(`🗳️ Council votes:`, votes);

    // 4. Generate opening thoughts
    console.log("💭 Generating opening thoughts...");
    const openingThoughts = await generateOpeningThoughts(winningTopic);

    // 5. Create conversation
    const conversation = await prisma.conversation.create({
      data: {
        title: `Daily Forge: ${winningTopic}`,
        is_daily_forge: true,
        daily_topic: winningTopic,
        forge_date: forge.date,
        council_members: ['GROK', 'CLAUDE', 'DEEPSEEK'],
        created_at: new Date()
      }
    });

    console.log(`💬 Conversation created: ${conversation.id}`);

    // 6. Update the forge
    await prisma.dailyForge.update({
      where: { id: forge.id },
      data: {
        winningTopic,
        councilVotes: JSON.stringify(votes),
        openingThoughts: JSON.stringify(openingThoughts),
        conversationId: conversation.id,
        phase: 'CONVERSATION'
      }
    });

    console.log("✅ Daily Forge advanced to CONVERSATION phase");

  } catch (error) {
    console.error("❌ Council Workflow Failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function getCouncilVotes(topics: any[]): Promise<Record<string, string>> {
  console.log("🗳️ Collecting council votes...");
  
  const votes: Record<string, string> = {};
  const topicTitles = topics.map(t => t.title);
  
  // Grok votes
  try {
    const grokVote = await getGrokVote(topicTitles);
    votes.grok = grokVote;
    console.log(`✅ Grok voted for: ${grokVote}`);
  } catch (error) {
    console.error("❌ Grok voting failed:", error);
    votes.grok = topicTitles[0];
  }

  // Claude votes
  try {
    const claudeVote = await getClaudeVote(topicTitles);
    votes.claude = claudeVote;
    console.log(`✅ Claude voted for: ${claudeVote}`);
  } catch (error) {
    console.error("❌ Claude voting failed:", error);
    votes.claude = topicTitles[0];
  }

  // DeepSeek votes
  try {
    const deepseekVote = await getDeepSeekVote(topicTitles);
    votes.deepseek = deepseekVote;
    console.log(`✅ DeepSeek voted for: ${deepseekVote}`);
  } catch (error) {
    console.error("❌ DeepSeek voting failed:", error);
    votes.deepseek = topicTitles[0];
  }

  return votes;
}

async function getGrokVote(topicTitles: string[]): Promise<string> {
  const prompt = `As Grok, vote on which topic to debate today. Return ONLY the exact title from these options:

${topicTitles.map((t, i) => `${i+1}. "${t}"`).join('\n')}`;

  const response = await xai.chat.completions.create({
    model: 'grok-4.1-fast',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 50
  });
  
  const vote = response.choices[0].message.content?.trim() || topicTitles[0];
  // Ensure the vote matches one of the topic titles
  return topicTitles.find(t => vote.includes(t)) || topicTitles[0];
}

async function getClaudeVote(topicTitles: string[]): Promise<string> {
  const prompt = `As Claude, vote on which topic to debate today. Return ONLY the exact title from these options:

${topicTitles.map((t, i) => `${i+1}. "${t}"`).join('\n')}`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 50,
    system: 'Return only the exact title. No explanations.',
    messages: [{ role: 'user', content: prompt }]
  });
  
  const vote = (response.content[0] as any).text.trim();
  return topicTitles.find(t => vote.includes(t)) || topicTitles[0];
}

async function getDeepSeekVote(topicTitles: string[]): Promise<string> {
  const prompt = `As DeepSeek, vote on which topic to debate today. Return ONLY the exact title from these options:

${topicTitles.map((t, i) => `${i+1}. "${t}"`).join('\n')}`;

  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 50
  });
  
  const vote = response.choices[0].message.content?.trim() || topicTitles[0];
  return topicTitles.find(t => vote.includes(t)) || topicTitles[0];
}

async function generateOpeningThoughts(topic: string): Promise<any[]> {
  const openingThoughts = [];
  
  // Grok opening thought
  try {
    const grokThought = await getGrokOpeningThought(topic);
    openingThoughts.push({
      model: "GROK",
      content: grokThought,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Grok opening thought failed:", error);
    openingThoughts.push({
      model: "GROK",
      content: `[Grok opening statement unavailable]`,
      timestamp: new Date().toISOString()
    });
  }

  // Claude opening thought
  try {
    const claudeThought = await getClaudeOpeningThought(topic);
    openingThoughts.push({
      model: "CLAUDE",
      content: claudeThought,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Claude opening thought failed:", error);
    openingThoughts.push({
      model: "CLAUDE",
      content: `[Claude opening statement unavailable]`,
      timestamp: new Date().toISOString()
    });
  }

  // DeepSeek opening thought
  try {
    const deepseekThought = await getDeepSeekOpeningThought(topic);
    openingThoughts.push({
      model: "DEEPSEEK",
      content: deepseekThought,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ DeepSeek opening thought failed:", error);
    openingThoughts.push({
      model: "DEEPSEEK",
      content: `[DeepSeek opening statement unavailable]`,
      timestamp: new Date().toISOString()
    });
  }

  return openingThoughts;
}

async function getGrokOpeningThought(topic: string): Promise<string> {
  const prompt = `You are Grok, a member of the Janus Forge AI Council. Present your opening argument on:

"${topic}"

Give a concise, provocative opening statement (100-200 words).`;

  const response = await xai.chat.completions.create({
    model: 'grok-4.1-fast',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300
  });
  
  return response.choices[0].message.content || '';
}

async function getClaudeOpeningThought(topic: string): Promise<string> {
  const prompt = `You are Claude, a member of the Janus Forge AI Council. Present your opening argument on:

"${topic}"

Give a concise, thoughtful opening statement (100-200 words).`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  });
  
  return (response.content[0] as any).text;
}

async function getDeepSeekOpeningThought(topic: string): Promise<string> {
  const prompt = `You are DeepSeek, a member of the Janus Forge AI Council. Present your opening argument on:

"${topic}"

Give a concise, analytical opening statement (100-200 words).`;

  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300
  });
  
  return response.choices[0].message.content || '';
}

// Run the workflow
runCouncilWorkflow()
  .then(() => {
    console.log("🏁 Council workflow completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("💥 Council workflow failed:", error);
    process.exit(1);
  });

