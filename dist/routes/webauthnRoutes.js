"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const webauthnController_1 = require("../controllers/webauthnController");
const router = (0, express_1.Router)();
// Public: Start authentication (get challenge)
router.get('/authenticate/generate', webauthnController_1.generateAuthentication);
// Public: Finish authentication (verify biometric and issue JWT)
router.post('/authenticate/verify', webauthnController_1.verifyAuthentication);
// Protected: Register new biometric device (user must be logged in)
router.get('/register/generate', authMiddleware_1.requireAuth, webauthnController_1.generateRegistration);
router.post('/register/verify', authMiddleware_1.requireAuth, webauthnController_1.verifyRegistration);
exports.default = router;
