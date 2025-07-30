const Bookmark = require("../models/Bookmark");

// Ajouter un favori
exports.addBookmark = async (req, res) => {
  try {
    const { message, type, title, content, author, chatName, thumbnail, url } =
      req.body;
    const user = req.user._id;
    const bookmark = await Bookmark.create({
      user,
      message,
      type,
      title,
      content,
      author,
      chatName,
      thumbnail,
      url,
    });
    // Notifier en temps réel l'utilisateur
    if (req.app.get("io")) {
      req.app.get("io").to(user.toString()).emit("bookmarkAdded", bookmark);
    }
    res.status(201).json({ success: true, data: bookmark });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Supprimer un favori
exports.removeBookmark = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user._id;
    const bookmark = await Bookmark.findOneAndDelete({ _id: id, user });
    if (!bookmark) {
      return res
        .status(404)
        .json({ success: false, message: "Favori introuvable" });
    }
    // Notifier en temps réel l'utilisateur
    if (req.app.get("io")) {
      req.app.get("io").to(user.toString()).emit("bookmarkRemoved", { id });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Lister les favoris de l'utilisateur
exports.getBookmarks = async (req, res) => {
  try {
    const user = req.user._id;
    const bookmarks = await Bookmark.find({ user }).sort({ date: -1 });
    res.json({ success: true, data: bookmarks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
