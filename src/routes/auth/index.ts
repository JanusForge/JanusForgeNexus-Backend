// src/routes/auth/index.ts - SOVEREIGNTY VERSION
import { Router } from 'express';
import prisma from '../../lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `https://janusforge.ai/verify-email?token=${token}`;
  await resend.emails.send({
    from: 'Janus Forge <no-reply@janusforge.ai>',
    to: email,
    subject: 'Verify Your Janus Forge Account',
    html: `<div style="background: #000; color: #fff; padding: 20px; border-radius: 10px;">
        <h2 style="color: #9f7aea;">Welcome to Janus Forge</h2>
        <p>Verify your identity to activate your neural link.</p>
        <a href="${verificationUrl}" style="background: #9f7aea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Now</a>
      </div>`
  });
}

// REGISTER
router.post('/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;
  try {
    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) return res.status(400).json({ error: "Email registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
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
        emailVerified: false,
        verificationToken: crypto.randomBytes(32).toString('hex'),
        verificationTokenExpires: new Date(Date.now() + 3600000)
      }
    });

    await sendVerificationEmail(email, user.verificationToken!);
    res.status(201).json({ message: "Check email.", user: { id: user.id, access_expiry: user.access_expiry } });
  } catch (error) { res.status(500).json({ error: "Registration failed" }); }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.password_hash || !user.emailVerified) return res.status(401).json({ error: "Invalid or unverified" });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      access_expiry: user.access_expiry,
      is_sovereign: user.is_sovereign
    });
  } catch (error) { res.status(500).json({ error: "Login failed" }); }
});

// TEST REFUEL - MOCK PAYMENT SUCCESS
router.post('/test-refuel', async (req, res) => {
  const { userId, hours } = req.body;
  try {
    const newExpiry = new Date(Date.now() + hours * 60 * 60 * 1000);
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { access_expiry: newExpiry, is_sovereign: true }
    });
    res.json({ message: "Refueled", access_expiry: updatedUser.access_expiry });
  } catch (error) { res.status(500).json({ error: "Refuel failed" }); }
});

export default router;
