"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webhookController_1 = require("../controllers/webhookController");
const router = (0, express_1.Router)();
router.post('/biometric-punch', webhookController_1.biometricPunch);
router.get('/cron/trigger-pushes', webhookController_1.triggerScheduledPushesEndpoint);
exports.default = router;
