import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/authMiddleware';
import * as managerController from '../controllers/managerController';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['ROLE_MANAGER', 'ROLE_ADMIN']));

router.get('/team', managerController.team);
router.get('/team/attendance', managerController.teamAttendance);
router.get('/regularization-requests/pending', managerController.pendingRegularizations);
router.post('/regularization-requests/:id/recommend', managerController.recommendRegularization);
router.get('/work-requests/pending', managerController.pendingWorkRequests);
router.post('/work-requests/:id/recommend', managerController.recommendWorkRequest);
router.post('/work-requests/:id/reject', managerController.rejectWorkRequest);

export default router;
