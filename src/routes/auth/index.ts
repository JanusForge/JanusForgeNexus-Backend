// src/routes/auth/index.ts - SOVEREIGNTY SECURITY VERSION
import { Router } from 'express';
import prisma from '../../lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `https://janusforgenexus-backend.onrender.com/api/auth/verify-email?token=${token}`;
  
  await resend.emails.send({
    from: 'Janus Forge <no-reply@janusforge.ai>',
    to: email,
    subject: 'Verify Your Janus Forge Identity',
    html: `
      <div style="background: #000; color: #fff; padding: 40px; border-radius: 20px; font-family: sans-serif; border: 1px solid #333;">
        <h2 style="color: #6366f1; text-transform: uppercase; letter-spacing: 0.2em;">Neural Link Protocol</h2>
        <p style="color: #888; line-height: 1.6;">A request to initialize this profile has been detected. Click below to verify your frequency and activate your account.</p>
        <a href="${verificationUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; margin-top: 20px;">Verify Identity</a>
        <p style="margin-top: 30px; font-size: 10px; color: #444; text-transform: uppercase;">Reference: ${token.substring(0, 8)}...</p>
      </div>
    `
  });
}

// --- 1. REGISTER ---
router.post('/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;
  try {
    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) return res.status(400).json({ error: "Email already registered." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    
    const isAdmin = email.toLowerCase() === 'admin@janusforge.ai';
    const isBeta = referralCode.trim().toUpperCase() === 'BETA_2026';

    const trialHours = isAdmin ? 876000 : (isBeta ? 24 : 1);
    const initialExpiry = new Date(Date.now() + trialHours * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        username,
        email: email.toLowerCase(),
        password_hash: hashedPassword,
        role: isAdmin ? 'GOD_MODE' : (isBeta ? 'BETA_ARCHITECT' : 'USER'),
        access_expiry: initialExpiry,
        is_sovereign: true,
        emailVerified: false, // 🔒 Start locked
        verificationToken: token,
        verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24H window
      }
    });

    await sendVerificationEmail(email, token);
    res.status(201).json({ message: "Check your email to verify your profile." });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Registration failed." });
  }
});

// --- 2. VERIFY EMAIL (The Bridge) ---
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  try {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: String(token),
        verificationTokenExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).send("<h1>Link invalid or expired.</h1>");
    }

    // 🎖️ FOUNDER CHECK: See if we still have slots in the Genesis 100
    const founderCount = await prisma.user.count({ where: { is_founder: true } });
    const qualifyAsFounder = founderCount < 100;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        is_founder: qualifyAsFounder, // Automatically awards status if slot available
        verificationToken: null,
        verificationTokenExpires: null
      }
    });

    // Redirect to your frontend login page with a success flag
    res.redirect('https://janusforge.ai/login?verified=true');
  } catch (error) {
    res.status(500).send("Verification internal error.");
  }
});

// --- 3. LOGIN ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    
    // Safety check: must exist, have a password, and be verified
    if (!user || !user.password_hash || !user.emailVerified) {
      return res.status(401).json({ error: "Identity unknown or unverified." });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: "Access denied." });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      access_expiry: user.access_expiry,
      is_sovereign: user.is_sovereign
    });
  } catch (error) {
    res.status(500).json({ error: "Internal login failure." });
  }
});

export default router;
