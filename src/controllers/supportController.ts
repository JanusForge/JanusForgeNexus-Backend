import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Resend } from 'resend';

// Initialized with your JanusForge_Production key
const resend = new Resend(process.env.RESEND_API_KEY);

export const transmitSupportTicket = async (req: Request, res: Response) => {
  try {
    const { subject, message, userId } = req.body;

    // 🛡️ Data Integrity Check
    if (!subject || !message || !userId) {
      return res.status(400).json({ 
        error: "Incomplete Transmission: Subject, message, and UserID are required." 
      });
    }

    // 1. Record the transmission in Neon (Table #11: support_tickets)
    const ticket = await prisma.supportTicket.create({
      data: {
        subject,
        message,
        user_id: userId,
        status: "OPEN",
        priority: "NORMAL"
      },
      include: {
        user: true // Fetch user email for the auto-reply
      }
    });

    // 2. DISPATCH: AI Acknowledgement to User (The "First Responder" facade)
    await resend.emails.send({
      from: 'Nexus Support <support@janusforge.ai>',
      to: ticket.user.email,
      subject: `[AUTOREPLY] Transmission Received: ${subject}`,
      html: `
        <div style="font-family: monospace; background-color: #000; color: #fff; padding: 30px; border: 1px solid #333;">
          <h2 style="color: #3b82f6; border-bottom: 1px solid #333; padding-bottom: 10px;">&gt; NEURAL LINK ESTABLISHED</h2>
          <p>Architect <strong>${ticket.user.username}</strong>, your transmission regarding <strong>${subject}</strong> has been logged.</p>
          <p>The AI Council has categorized this inquiry. A Master Architect is currently reviewing the neural logs for anomalies.</p>
          <p style="color: #555; font-size: 10px; margin-top: 20px;">Ref ID: ${ticket.id}</p>
        </div>
      `,
    });

    // 3. ALERT: Sentinel Notification to Master Authority (support@janusforge.ai)
    await resend.emails.send({
      from: 'Nexus Sentinel <sentinel@janusforge.ai>',
      to: 'support@janusforge.ai',
      subject: `[SENTINEL ALERT] First Response Initiated for Architect: ${ticket.user.username}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border-left: 4px solid #3b82f6; background-color: #f9f9f9;">
          <h3 style="color: #1e3a8a; margin-top: 0;">Sentinel Notification</h3>
          <p>The AI has acted as the first responder for <strong>${ticket.user.email}</strong>.</p>
          <div style="background: #eee; padding: 15px; border-radius: 5px; font-style: italic;">
            " ${message} "
          </div>
          <p style="font-size: 12px; color: #666; margin-top: 15px;">
            The user has been notified that the Authority is reviewing. You can now interject via Nexus Watch.
          </p>
        </div>
      `,
    });

    return res.status(201).json({
      success: true,
      message: "Transmission logged and Sentinel alerted.",
      ticketId: ticket.id
    });

  } catch (error) {
    console.error("Support Handshake Failed:", error);
    return res.status(500).json({ 
      error: "Neural Link Error: Could not complete the support protocol." 
    });
  }
};

/**
 * 🕵️ fetchUserTickets
 * Allows an Architect to see their own past support history in the dashboard
 */
export const getUserTickets = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
    return res.json(tickets);
  } catch (error) {
    return res.status(500).json({ error: "Failed to retrieve transmission history." });
  }
};
