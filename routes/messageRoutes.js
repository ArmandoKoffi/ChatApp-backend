const express = require('express');
const router = express.Router();
const {
  sendPrivateMessage,
  sendPrivateVoiceMessage,
  uploadMediaMessage,
  sendRoomMessage,
  getPrivateMessages,
  getRoomMessages,
  deleteMessage,
  addReaction,
  markAsRead,
  markAsPlayed,
  getLastMessages,
  getSharedData
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const { uploadMessage, handleUploadError } = require('../middleware/upload');

// Routes des messages privés
router.post('/private/:receiverId', protect, uploadMessage, handleUploadError, sendPrivateMessage);
router.post('/private/:receiverId/voice', protect, uploadMessage, handleUploadError, sendPrivateVoiceMessage);
router.post('/private/:receiverId/upload', protect, uploadMessage, handleUploadError, uploadMediaMessage);
router.get('/private/:userId', protect, getPrivateMessages);

// Routes des messages de salle
router.post('/room/:roomId', protect, uploadMessage, handleUploadError, sendRoomMessage);
router.get('/room/:roomId', protect, getRoomMessages);

// Routes de gestion des messages
router.delete('/:id', protect, deleteMessage);
router.post('/:id/reaction', protect, addReaction);
router.put('/:id/read', protect, markAsRead);
router.put('/:id/play', protect, markAsPlayed);

// Route pour récupérer les derniers messages de toutes les conversations
router.get('/last-messages', protect, getLastMessages);

// Route pour récupérer les données partagées (médias) d'une conversation privée
router.get('/shared/:userId', protect, getSharedData);

module.exports = router;
