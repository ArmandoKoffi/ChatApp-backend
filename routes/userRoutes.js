const express = require("express");
const router = express.Router();
const {
  updateProfile,
  changePassword,
  getAllUsers,
  getProfile,
  addContact,
  removeContact,
  getContacts,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getOnlineUsers,
} = require("../controllers/userController");
const { protect } = require("../middleware/auth");
const {
  updateProfileRules,
  changePasswordRules,
  validate,
} = require("../middleware/validator");
const { uploadProfile, handleUploadError } = require("../middleware/upload");

// Routes de profil
router.put(
  "/profile",
  protect,
  uploadProfile,
  handleUploadError,
  updateProfileRules,
  validate,
  updateProfile
);
router.put(
  "/change-password",
  protect,
  changePasswordRules,
  validate,
  changePassword
);

// Routes des utilisateurs
router.get("/", protect, getAllUsers);
router.get("/online", protect, getOnlineUsers);
router.get("/:id", protect, getProfile);

// Routes des contacts
router.post("/contacts/:id", protect, addContact);
router.delete("/contacts/:id", protect, removeContact);
router.get("/contacts", protect, getContacts);

// Routes de blocage
router.post("/block/:id", protect, blockUser);
router.delete("/block/:id", protect, unblockUser);
router.get("/blocked", protect, getBlockedUsers);

module.exports = router;
