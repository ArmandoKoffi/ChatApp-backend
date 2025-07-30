const Bookmark = require("../models/Bookmark");
const Message = require("../models/Message");

exports.getBookmarks = async (req, res) => {
  try {
    const bookmarks = await Bookmark.find({ user: req.user._id }).populate(
      "message"
    );
    res.json({ success: true, bookmarks });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

exports.addBookmark = async (req, res) => {
  try {
    const { messageId } = req.body;
    const message = await Message.findById(messageId);
    if (!message)
      return res
        .status(404)
        .json({ success: false, message: "Message non trouvé" });
    const bookmark = new Bookmark({
      user: req.user._id,
      message: message._id,
      type: "message",
      title: message.content,
      content: message.content,
      author: message.sender,
      chatName: message.chatRoom || "",
      date: message.createdAt,
    });
    await bookmark.save();
    res.json({ success: true, bookmark });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

exports.removeBookmark = async (req, res) => {
  try {
    await Bookmark.deleteOne({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};
