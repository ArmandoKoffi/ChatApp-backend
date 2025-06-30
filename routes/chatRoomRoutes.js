const express = require('express');
const router = express.Router();
const {
  createChatRoom,
  getChatRooms,
  getChatRoomById,
  updateChatRoom,
  deleteChatRoom,
  addMember,
  removeMember,
  promoteToAdmin,
  demoteFromAdmin,
  joinChatRoom,
  leaveChatRoom
} = require('../controllers/chatRoomController');
const { protect } = require('../middleware/auth');
const { uploadRoom, handleUploadError } = require('../middleware/upload');

// Routes de création et récupération
router.post('/', protect, uploadRoom, handleUploadError, createChatRoom);
router.get('/', protect, getChatRooms);
router.get('/:id', protect, getChatRoomById);

// Routes de mise à jour et suppression
router.put('/:id', protect, uploadRoom, handleUploadError, updateChatRoom);
router.delete('/:id', protect, deleteChatRoom);

// Routes de gestion des membres
router.post('/:id/members/:userId', protect, addMember);
router.delete('/:id/members/:userId', protect, removeMember);

// Routes de gestion des administrateurs
router.post('/:id/admins/:userId', protect, promoteToAdmin);
router.delete('/:id/admins/:userId', protect, demoteFromAdmin);

// Routes pour rejoindre/quitter une salle
router.post('/:id/join', protect, joinChatRoom);
router.post('/:id/leave', protect, leaveChatRoom);

module.exports = router;