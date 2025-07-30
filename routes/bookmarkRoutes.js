const express = require("express");
const router = express.Router();
const bookmarkController = require("../controllers/bookmarkController");
const auth = require("../middleware/auth");

// Ajouter un favori
router.post("/", auth, bookmarkController.addBookmark);
// Supprimer un favori
router.delete("/:id", auth, bookmarkController.removeBookmark);
// Lister les favoris
router.get("/", auth, bookmarkController.getBookmarks);

module.exports = router;
