import { Router } from 'express';
import { login, refresh, me } from '../controllers/authController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', requireAuth, me);

export default router;
