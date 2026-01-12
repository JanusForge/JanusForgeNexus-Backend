// src/routes/auth.ts - FULL UPDATED VERSION WITH EMAIL VERIFICATION
import { Router } from 'express';
import prisma from './lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Resend } from 'resend';
const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);
// Helper: Send verification email
async function sendVerificationEmail(email, token) {
    const verificationUrl = `https://janusforge.ai/api/auth/verify-email?token=${token}`;
    await resend.emails.send({
        from: 'Janus Forge <no-reply@janusforge.ai>',
        to: email,
        subject: 'Verify Your Janus Forge Account',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background: #000; color: #fff;">
        <h2 style="color: #9f7aea;">Welcome to Janus Forge</h2>
        <p>Thank you for joining the council. Please verify your email to activate your account and begin interjecting in the Daily Forge debates.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #9f7aea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">Verify Email Now</a>
        </div>
        <p>Or copy and paste this link:<br><small style="color: #888;">${verificationUrl}</small></p>
        <p>This link expires in 1 hour.</p>
        <hr style="border-color: #333;">
        <p style="color: #666; font-size: 12px;">If you didn't register at Janus Forge, please ignore this email.</p>
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
        const isBeta = referralCode.trim().toUpperCase() === 'BETA_2026';
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        const user = await prisma.user.create({
            data: {
                username,
                email: email.toLowerCase(),
                password_hash: hashedPassword,
                role: isBeta ? 'BETA_ARCHITECT' : 'USER',
                tokens_remaining: isBeta ? 50 : 10,
                token_balance: isBeta ? 50 : 10,
                digest_subscribed: true,
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
    }
    catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});
// VERIFY EMAIL ENDPOINT
router.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
        return res.status(400).send('Invalid verification link');
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
            return res.status(400).send('Invalid or expired verification link');
        }
        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerified: true,
                verificationToken: null,
                verificationTokenExpires: null
            }
        });
        // Redirect to frontend success page
        res.redirect('https://janusforge.ai/login/verify-success');
    }
    catch (error) {
        console.error("Verification error:", error);
        res.status(500).send('Verification failed');
    }
});
// RESEND VERIFICATION (optional but useful)
router.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });
        if (!user)
            return res.status(404).json({ error: "User not found" });
        if (user.emailVerified)
            return res.status(400).json({ error: "Email already verified" });
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
    }
});
export default router;
// keep it clean - clw
