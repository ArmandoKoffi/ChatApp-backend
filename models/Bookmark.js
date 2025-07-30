const mongoose = require("mongoose");

const BookmarkSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    required: true,
  },
  type: {
    type: String,
    enum: ["message", "media", "file", "link"],
    default: "message",
  },
  title: { type: String },
  content: { type: String },
  author: { type: String },
  chatName: { type: String },
  thumbnail: { type: String },
  url: { type: String },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Bookmark", BookmarkSchema);
