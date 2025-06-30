const express = require('express');
const router = express.Router();
const { getMediaItems } = require('../controllers/mediaController');
const { protect } = require('../middleware/auth');

// Route to get all media items
router.get('/', protect, getMediaItems);

module.exports = router;
