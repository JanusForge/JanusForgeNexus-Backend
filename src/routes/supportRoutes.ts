import { Router } from 'express';
import { transmitSupportTicket, getUserTickets } from '../controllers/supportController';

const router = Router();

// Route: POST /api/support/transmit
router.post('/transmit', transmitSupportTicket);

// Route: GET /api/support/history/:userId
router.get('/history/:userId', getUserTickets);

export default router;
