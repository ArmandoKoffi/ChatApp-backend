const express = require("express");
const router = express.Router();
const bookmarksController = require("../controllers/bookmarksController");
const auth = require("../middleware/auth");

router.get("/", auth, bookmarksController.getBookmarks);
router.post("/", auth, bookmarksController.addBookmark);
router.delete("/:id", auth, bookmarksController.removeBookmark);

module.exports = router;
