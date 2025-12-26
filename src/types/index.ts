import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

export type UserTier = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
export type AIModel = 'GROK' | 'GEMINI_PRO' | 'CLAUDE' | 'CHATGPT' | 'DEEPSEEK';

export interface UserPayload extends JwtPayload {
  userId: string;
  tier: UserTier;
  email: string;
  username: string;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  tier?: UserTier;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface PostRequest {
  content: string;
  conversationId: string;
  parentPostId?: string;
}

export interface AIResponseRequest {
  postId: string;
  aiModel: AIModel;
  content: string;
  tokensUsed: number;
  costCents: number;
}
