const Message = require('../models/Message');
const { getDecryptedUrl } = require('../utils/cloudinary');

// @desc    Get all media items for the logged-in user
// @route   GET /api/media
// @access  Private
exports.getMediaItems = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find messages with media content that involve the user (either as sender or receiver)
    const messages = await Message.find({
      $or: [
        { sender: userId },
        { receiver: userId },
        { room: { $in: req.user.rooms } }
      ],
      $or: [
        { image: { $ne: '' } },
        { audio: { $ne: '' } },
        { video: { $ne: '' } },
        { file: { $ne: '' } }
      ]
    })
    .populate('sender', 'username')
    .sort({ createdAt: -1 });

    // Format media items for response
    const mediaItems = messages.map((msg, index) => {
      let url = '';
      let type = 'image';
      let title = 'Media Item';

      if (msg.image) {
        url = msg.imageSecure ? getDecryptedUrl(msg.image, msg.imageSecure) : msg.image;
        type = 'image';
        title = 'Shared Image';
      } else if (msg.audio) {
        url = msg.audioSecure ? getDecryptedUrl(msg.audio, msg.audioSecure) : msg.audio;
        type = 'audio';
        title = 'Audio Recording';
      } else if (msg.video) {
        url = msg.videoSecure ? getDecryptedUrl(msg.video, msg.videoSecure) : msg.video;
        type = 'video';
        title = 'Video Clip';
      } else if (msg.file) {
        url = msg.fileSecure ? getDecryptedUrl(msg.file, msg.fileSecure) : msg.file;
        type = 'file';
        title = msg.fileName || 'Shared File';
      }

      // Calculate relative date
      const date = new Date(msg.createdAt);
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      let dateStr = '';
      if (diffDays === 0) {
        dateStr = 'Today';
      } else if (diffDays === 1) {
        dateStr = 'Yesterday';
      } else if (diffDays < 7) {
        dateStr = `${diffDays} days ago`;
      } else {
        dateStr = date.toLocaleDateString();
      }

      return {
        id: index + 1,
        url,
        title,
        date: dateStr,
        sender: msg.sender ? msg.sender.username : 'Unknown',
        type
      };
    });

    res.status(200).json({
      success: true,
      count: mediaItems.length,
      media: mediaItems
    });
  } catch (error) {
    console.error('Error fetching media items:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching media items',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
