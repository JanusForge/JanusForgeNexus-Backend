import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { RegisterRequest, LoginRequest, AuthenticatedRequest } from '../types';
import crypto from 'crypto';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const router = Router();
const prisma = new PrismaClient();

// Password validation helper
const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};

// Generate tokens using single JWT_SECRET
const generateTokens = (userId: string, email: string, tier: string) => {
  const jwtSecret = process.env.JWT_SECRET; // Use single secret

  if (!jwtSecret) {
    throw new Error('JWT secret not configured');
  }

  const accessToken = jwt.sign(
    { userId, email, tier },
    jwtSecret,
    { expiresIn: (process.env.ACCESS_TOKEN_EXPIRY as any) || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, email, tier },
    jwtSecret,
    { expiresIn: (process.env.REFRESH_TOKEN_EXPIRY as any) || '7d' }
  );

  return { accessToken, refreshToken };
};

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, username, password }: RegisterRequest = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ message: 'Email, username, and password are required' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'User already exists',
        field: existingUser.email === email ? 'email' : 'username'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password_hash: hashedPassword,
        tier: 'FREE',
        token_balance: 10,        // FREE users get 10 tokens total
        tokens_remaining: 10,     // They start with 10 available
        tokens_used: 0            // Haven't used any yet
      }
    });

    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.tier);

    await prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: refreshToken }
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        tier: user.tier,
        token_balance: user.token_balance,
        tokens_remaining: user.token_balance - user.tokens_used,
        tokens_used: user.tokens_used,
        created_at: user.created_at
      },
      accessToken,
      expiresIn: 15 * 60
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error during registration' });
  }
});

// Login user
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.tier);

    await prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: refreshToken }
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        tier: user.tier,
        token_balance: user.token_balance,
        tokens_remaining: user.token_balance - user.tokens_used,
        tokens_used: user.tokens_used,
        created_at: user.created_at
      },
      accessToken,
      expiresIn: 15 * 60
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error during login' });
  }
});

// Refresh access token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies.refresh_token;

    if (!token) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    const secret = process.env.JWT_SECRET; // Use single secret
    if (!secret) {
      throw new Error('JWT secret not configured');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    } catch (error) {
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        refresh_token: token
      }
    });

    if (!user) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateTokens(user.id, user.email, user.tier);

    await prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: newRefreshToken }
    });

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      accessToken: newAccessToken,
      expiresIn: 15 * 60
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: 'Internal server error during token refresh' });
  }
});

// Logout user
router.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = req.cookies.refresh_token;

    if (token) {
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      if (decoded?.userId) {
        await prisma.user.update({
          where: { id: decoded.userId },
          data: { refresh_token: null }
        });
      }
    }

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({ message: 'Logout successful' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error during logout' });
  }
});

// Get current user profile
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        username: true,
        tier: true,
        token_balance: true,
        tokens_remaining: true,
        tokens_used: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Forgot password endpoint
export default router;
