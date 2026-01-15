import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Endpoint: POST /api/support/transmit
router.post('/transmit', async (req, res) => {
  const { subject, message, userId } = req.body;

  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        subject,
        message,
        user_id: userId, // Matches the @map("user_id") in your schema
      },
    });
    res.status(201).json({ success: true, ticket });
  } catch (error) {
    console.error("Transmission Error:", error);
    res.status(500).json({ error: "Transmission Interrupted" });
  }
});

export default router;
