import { PrismaClient, AIParticipant, UserTier } from '@prisma/client';

const prisma = new PrismaClient();

// Based on your pricing image
export const TIER_CONFIGURATIONS = {
  FREE: {
    tier: 'FREE' as UserTier,
    aiModels: ['CHATGPT', 'DEEPSEEK'] as AIParticipant[], // 2 cheapest models
    tokenAllowance: 50,
    priceCents: 0,
    features: [
      '2 AI models per debate',
      '50 tokens/month',
      'Basic human engagement',
      'Community support',
      '7-day debate history'
    ]
  },
  BASIC: {
    tier: 'BASIC' as UserTier,
    aiModels: ['CHATGPT', 'DEEPSEEK', 'GEMINI_PRO'] as AIParticipant[], // 3 models
    tokenAllowance: 250,
    priceCents: 900, // $9.00
    features: [
      '3 AI models per debate',
      '250 tokens/month',
      'Enhanced human engagement',
      'Email support',
      '30-day debate history',
      'Custom debate topics'
    ]
  },
  PROFESSIONAL: {
    tier: 'PROFESSIONAL' as UserTier,
    aiModels: ['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'] as AIParticipant[], // All 5 models
    tokenAllowance: 1000,
    priceCents: 2900, // $29.00
    features: [
      'All 5 AI models',
      '1000 tokens/month',
      'Priority human engagement',
      'Phone & email support',
      '90-day debate history',
      'Advanced analytics',
      'API access (coming soon)'
    ]
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE' as UserTier,
    aiModels: ['GROK', 'GEMINI_PRO', 'CLAUDE', 'CHATGPT', 'DEEPSEEK'] as AIParticipant[], // All by default
    tokenAllowance: 50000, // $500+ worth of tokens
    priceCents: 9900, // $99.00
    features: [
      'Custom AI model selection',
      '$500+ tokens/month',
      'Dedicated human moderator',
      '24/7 priority support',
      'Unlimited debate history',
      'Advanced analytics dashboard',
      'Full API access',
      'Custom feature development',
      'SLA guarantee'
    ]
  }
};

// AI model cost in cents per 1K tokens (approximate - adjust based on your actual costs)
export const AI_MODEL_COSTS: Record<AIParticipant, number> = {
  DEEPSEEK: 0.14,      // $0.14 per 1K tokens
  CHATGPT: 1.50,       // $1.50 per 1K tokens (GPT-3.5 Turbo)
  GEMINI_PRO: 1.25,    // $1.25 per 1K tokens
  CLAUDE: 8.00,        // $8.00 per 1K tokens
  GROK: 2.00           // $2.00 per 1K tokens (estimated)
};

export const getAvailableModelsForTier = (tier: UserTier): AIParticipant[] => {
  switch (tier) {
    case 'FREE':
      return TIER_CONFIGURATIONS.FREE.aiModels;
    case 'BASIC':
      return TIER_CONFIGURATIONS.BASIC.aiModels;
    case 'PROFESSIONAL':
      return TIER_CONFIGURATIONS.PROFESSIONAL.aiModels;
    case 'ENTERPRISE':
      return TIER_CONFIGURATIONS.ENTERPRISE.aiModels;
    default:
      return TIER_CONFIGURATIONS.FREE.aiModels;
  }
};

export const getTierConfiguration = (tier: UserTier) => {
  return TIER_CONFIGURATIONS[tier];
};

export const calculateAICost = (model: AIParticipant, tokensUsed: number): number => {
  const costPer1KTokens = AI_MODEL_COSTS[model];
  return Math.ceil((tokensUsed / 1000) * costPer1KTokens * 100); // Return in cents
};

// Initialize tier configurations in database
export const initializeTierConfigurations = async () => {
  try {
    for (const [tierKey, config] of Object.entries(TIER_CONFIGURATIONS)) {
      await prisma.tierConfiguration.upsert({
        where: { tier: config.tier },
        update: {
          aiModels: config.aiModels,
          tokenAllowance: config.tokenAllowance,
          priceCents: config.priceCents
        },
        create: {
          tier: config.tier,
          aiModels: config.aiModels,
          tokenAllowance: config.tokenAllowance,
          priceCents: config.priceCents
        }
      });
    }
    console.log('✅ Tier configurations initialized');
  } catch (error) {
    console.error('Error initializing tier configurations:', error);
  }
};
