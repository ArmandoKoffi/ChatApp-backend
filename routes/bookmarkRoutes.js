const express = require("express");
const router = express.Router();
const bookmarkController = require("../controllers/bookmarkController");
const auth = require("../middleware/auth");

// Ajouter un favori
router.post("/", auth.protect, bookmarkController.addBookmark);
// Supprimer un favori
router.delete("/:id", auth.protect, bookmarkController.removeBookmark);
// Lister les favoris
router.get("/", auth.protect, bookmarkController.getBookmarks);

module.exports = router;
