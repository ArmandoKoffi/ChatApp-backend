const express = require('express');
const router = express.Router();
const { register, login, logout, getMe, forgotPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { registerRules, loginRules, forgotPasswordRules, validate } = require('../middleware/validator');
const { uploadProfile, handleUploadError, cleanupTempFile } = require('../middleware/upload');

// Routes d'authentification
router.post('/register', uploadProfile, handleUploadError, registerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.get('/logout', protect, logout);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPasswordRules, validate, forgotPassword);

module.exports = router;
