// src/routes/auth/index.ts - FULL UPDATED VERSION FOR NEXUS PRIME
import { Router } from 'express';
import prisma from '../../lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper: Send verification email
async function sendVerificationEmail(email: string, token: string) {
  // ✅ FIX: Point to Frontend UI page instead of API to avoid 404
  const verificationUrl = `https://janusforge.ai/verify-email?token=${token}`;

  await resend.emails.send({
    from: 'Janus Forge <no-reply@janusforge.ai>',
    to: email,
    subject: 'Verify Your Janus Forge Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background: #000; color: #fff;">
        <h2 style="color: #9f7aea; text-transform: uppercase;">Welcome to Janus Forge</h2>
        <p>Thank you for joining the council. Please verify your identity to activate your neural link and begin interjecting in the Daily Forge debates.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #9f7aea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">Verify Identity Now</a>
        </div>
        <p>Or copy and paste this link:<br><small style="color: #888;">${verificationUrl}</small></p>
        <p>This link expires in 1 hour.</p>
        <hr style="border-color: #333;">
        <p style="color: #666; font-size: 12px;">Protocol 0 Security measure. If you didn't register at Janus Forge, please ignore this email.</p>
      </div>
    `,
  });
}

// REGISTER - Creates unverified user + sends verification email
router.post('/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 🛡️ Master Authority Protection [cite: 2025-11-27]
    const isAdmin = email.toLowerCase() === 'admin@janusforge.ai';
    const isBeta = referralCode.trim().toUpperCase() === 'BETA_2026';

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const user = await prisma.user.create({
      data: {
        username,
        email: email.toLowerCase(),
        password_hash: hashedPassword,
        role: isAdmin ? 'GOD_MODE' : (isBeta ? 'BETA_ARCHITECT' : 'USER'),
        tokens_remaining: isAdmin ? 999999 : (isBeta ? 50 : 10),
        token_balance: isAdmin ? 999999 : (isBeta ? 50 : 10),
        emailVerified: false,
        verificationToken,
        verificationTokenExpires,
      }
    });

    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      message: "Registration successful! Please check your email to verify your account.",
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// VERIFY EMAIL ENDPOINT (Handshake with Frontend)
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Invalid verification link' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpires: { gt: new Date() },
        emailVerified: false
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpires: null
      }
    });

    // ✅ Clean return for the Frontend Fetch
    return res.status(200).json({ message: "Identity confirmed." });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// RESEND VERIFICATION
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.emailVerified) return res.status(400).json({ error: "Email already verified" });

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: newToken,
        verificationTokenExpires: newExpires
      }
    });

    await sendVerificationEmail(email, newToken);

    res.json({ message: "Verification email resent" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resend" });
  }
});

// LOGIN - Blocks unverified users
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: "Please verify your email before logging in" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json(user);
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
