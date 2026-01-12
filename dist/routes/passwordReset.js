import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
const router = express.Router();
const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);
// Forgot password endpoint - PRODUCTION READY
router.post('/forgot-password', async (req, res) => {
    console.log('📧 Forgot password request received');
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                error: 'Email is required',
                success: false
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
            select: { id: true, username: true, email: true }
        });
        // For security, always return success even if user doesn't exist
        if (!user) {
            console.log(`⚠️ User not found for email: ${email}`);
            return res.json({
                message: 'If an account exists with this email, you will receive a reset link',
                success: true
            });
        }
        console.log(`✅ User found: ${user.email}`);
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
        // Store reset token in database
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetToken,
                resetTokenExpiry
            }
        });
        // Create reset link
        const frontendUrl = process.env.FRONTEND_URL || 'https://www.janusforge.ai';
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
        console.log(`📤 Sending reset email to: ${user.email}`);
        // Send email using Resend - PRODUCTION SETTINGS
        const { data, error } = await resend.emails.send({
            from: 'Janus Forge Nexus <support@janusforge.ai>', // CHANGE TO YOUR VERIFIED DOMAIN
            to: [user.email],
            replyTo: 'support@janusforge.ai',
            subject: 'Reset Your Password - Janus Forge Nexus',
            html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Janus Forge Nexus</h1>
          </div>
          <div style="background: #f9f9f9; padding: 40px; border-radius: 0 0 10px 10px; border: 1px solid #eaeaea;">
            <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
            <p>Hello <strong>${user.username}</strong>,</p>
            <p>You requested to reset your password for your Janus Forge Nexus account.</p>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 14px;">
              ${resetLink}
            </div>
            <p style="color: #666; font-size: 14px;">
              <strong>Important:</strong> If you didn't request this password reset, please ignore this email. Your account remains secure.
            </p>
            <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              This is an automated message from Janus Forge Nexus. Please do not reply to this email.
            </p>
          </div>
        </body>
        </html>
      `,
            text: `Reset your Janus Forge Nexus password\n\nHello ${user.username},\n\nYou requested to reset your password. Click the link below to reset it (expires in 1 hour):\n\n${resetLink}\n\nIf you didn't request this, please ignore this email.\n\n- Janus Forge Nexus Team`
        });
        if (error) {
            console.error('❌ Resend error:', error);
            // Don't reveal email sending errors to user for security
            return res.json({
                message: 'If an account exists with this email, you will receive a reset link',
                success: true
            });
        }
        console.log(`✅ Reset email sent to ${user.email}, ID: ${data?.id}`);
        res.json({
            message: 'If an account exists with this email, you will receive a reset link',
            success: true
        });
    }
    catch (error) {
        console.error('❌ Forgot password error:', error);
        // Always return success for security, even on server errors
        res.json({
            message: 'If an account exists with this email, you will receive a reset link',
            success: true
        });
    }
});
// Reset password endpoint - PRODUCTION READY
router.post('/reset-password', async (req, res) => {
    console.log('🔐 Reset password request received');
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({
                error: 'Token and password are required',
                success: false
            });
        }
        if (password.length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters',
                success: false
            });
        }
        // Check if token is valid
        const user = await prisma.user.findFirst({
            where: { resetToken: token },
            select: { id: true, resetTokenExpiry: true }
        });
        if (!user) {
            return res.status(400).json({
                error: 'Invalid or expired reset token',
                success: false
            });
        }
        // Check if token is expired
        if (new Date() > new Date(user.resetTokenExpiry)) {
            return res.status(400).json({
                error: 'Reset token has expired',
                success: false
            });
        }
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        // Update password and clear reset token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password_hash: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null
            }
        });
        console.log(`✅ Password reset successful for user: ${user.id}`);
        res.json({
            message: 'Password reset successful. You can now log in with your new password.',
            success: true
        });
    }
    catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({
            error: 'Failed to reset password',
            success: false
        });
    }
});
export default router;
