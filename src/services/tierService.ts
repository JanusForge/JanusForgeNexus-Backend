import prisma from './lib/prisma';


// Define local types to avoid Prisma export conflicts
export type UserTier = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
export type AIParticipant = 'JANUS' | 'NEXUS' | 'FORGE' | 'COUNCIL' | 'ARCHIVE';

interface TierConfig {
  tier: UserTier;
  ai_models: AIParticipant[];
  tokenAllowance: number;
  priceCents: number;
  features: string[];
}

export const TIER_CONFIGURATIONS: Record<UserTier, TierConfig> = {
  FREE: {
    tier: 'FREE',
    ai_models: ['JANUS', 'NEXUS'],
    tokenAllowance: 100,
    priceCents: 0,
    features: ['Basic AI Responses', 'Daily Forge Access']
  },
  BASIC: {
    tier: 'BASIC',
    ai_models: ['JANUS', 'NEXUS', 'FORGE'],
    tokenAllowance: 1000,
    priceCents: 1000,
    features: ['Faster Responses', '3 AI Models']
  },
  PROFESSIONAL: {
    tier: 'PROFESSIONAL',
    ai_models: ['JANUS', 'NEXUS', 'FORGE', 'COUNCIL'],
    tokenAllowance: 5000,
    priceCents: 2500,
    features: ['Priority Access', '4 AI Models']
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    ai_models: ['JANUS', 'NEXUS', 'FORGE', 'COUNCIL', 'ARCHIVE'],
    tokenAllowance: 20000,
    priceCents: 10000,
    features: ['Full Council Access', 'All Models']
  }
};

export const getTierConfiguration = (tier: UserTier): TierConfig => {
  return TIER_CONFIGURATIONS[tier] || TIER_CONFIGURATIONS.FREE;
};

export const getAvailableModelsForTier = (tier: UserTier): AIParticipant[] => {
  const config = getTierConfiguration(tier);
  return config.ai_models;
};

export const calculateAICost = (model: AIParticipant, tokens: number): number => {
  const baseRate = 0.002; // Cents per token
  return Math.ceil(tokens * baseRate);
};

export const initializeTierConfigs = async () => {
  try {
    for (const config of Object.values(TIER_CONFIGURATIONS)) {
      await prisma.tierConfiguration.upsert({
        where: { tier: config.tier },
        update: {
          ai_models: config.ai_models,
          token_allowance: config.tokenAllowance,
          price_cents: config.priceCents,
          // Commenting out features temporarily to bypass schema mismatch
          // features: config.features 
        },
        create: {
          tier: config.tier,
          ai_models: config.ai_models,
          token_allowance: config.tokenAllowance,
          price_cents: config.priceCents,
          // features: config.features
        }
      });
    }
    console.log('✅ Tier configurations initialized');
  } catch (error) {
    console.error('❌ Failed to initialize tier configs:', error);
  }
};
