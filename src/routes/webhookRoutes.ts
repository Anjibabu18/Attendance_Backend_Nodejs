import { Router } from 'express';
import { biometricPunch } from '../controllers/webhookController';

const router = Router();

router.post('/biometric-punch', biometricPunch);

export default router;
