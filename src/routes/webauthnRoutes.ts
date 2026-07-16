import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import {
  generateRegistration,
  verifyRegistration,
  generateAuthentication,
  verifyAuthentication,
} from '../controllers/webauthnController';

const router = Router();

// Public: Start authentication (get challenge)
router.get('/authenticate/generate', generateAuthentication);

// Public: Finish authentication (verify biometric and issue JWT)
router.post('/authenticate/verify', verifyAuthentication);

// Protected: Register new biometric device (user must be logged in)
router.get('/register/generate', requireAuth, generateRegistration);
router.post('/register/verify', requireAuth, verifyRegistration);

export default router;
