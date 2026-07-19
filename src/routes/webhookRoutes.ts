import { Router } from 'express';
import { biometricPunch, triggerScheduledPushesEndpoint } from '../controllers/webhookController';

const router = Router();

router.post('/biometric-punch', biometricPunch);
router.get('/cron/trigger-pushes', triggerScheduledPushesEndpoint);

export default router;
