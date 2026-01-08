import express from 'express';
import { Resend } from 'resend';
import { pool } from '../db';
import crypto from 'crypto';

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// Forgot password endpoint
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔐 Forgot password request for:', email);
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    // For security, always return success even if user doesn't exist
    if (userResult.rows.length === 0) {
      console.log('⚠️ No user found with email:', email);
      return res.json({ 
        message: 'If an account exists with this email, you will receive a reset link',
        success: true 
      });
    }

    const user = userResult.rows[0];
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    console.log('🔑 Generated reset token for user:', user.id);

    // Store reset token in database
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
      [resetToken, resetTokenExpiry, user.id]
    );

    // Create reset link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    console.log('📧 Sending reset email to:', user.email);
    
    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: 'Janus Forge Nexus <onboarding@resend.dev>', // Change this!
      to: [user.email],
      subject: 'Reset Your Password - Janus Forge Nexus',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #000; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Janus Forge Nexus</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2>Password Reset Request</h2>
            <p>Hello <strong>${user.username}</strong>,</p>
            <p>You requested to reset your password for Janus Forge Nexus.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Reset Password
              </a>
            </div>
            <p>Or copy and paste this link:</p>
            <div style="background: #eee; padding: 10px; border-radius: 5px; word-break: break-all;">
              ${resetLink}
            </div>
            <p><strong style="color: #e53e3e;">This link expires in 1 hour.</strong></p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        </div>
      `,
      text: `Reset your Janus Forge Nexus password: ${resetLink}\n\nThis link expires in 1 hour.`
    });

    if (error) {
      console.error('❌ Resend error:', error);
      return res.status(500).json({ error: 'Failed to send reset email' });
    }

    console.log('✅ Reset email sent successfully');
    res.json({ 
      message: 'Reset email sent successfully',
      success: true 
    });

  } catch (error: any) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    console.log('🔐 Reset password request');

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if token is valid
    const userResult = await pool.query(
      'SELECT id, reset_token_expiry FROM users WHERE reset_token = $1',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = userResult.rows[0];
    
    // Check if token is expired
    if (new Date() > new Date(user.reset_token_expiry)) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Update password (use bcrypt in production!)
    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
      [password, user.id]
    );

    console.log('✅ Password reset successful for user:', user.id);
    res.json({ 
      message: 'Password reset successful',
      success: true 
    });

  } catch (error: any) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
