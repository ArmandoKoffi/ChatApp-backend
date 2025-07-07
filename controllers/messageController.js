const Message = require("../models/Message");
const User = require("../models/User");
const ChatRoom = require("../models/ChatRoom");
const fs = require("fs");
const path = require("path");

// @desc    Envoyer un message privé à un utilisateur
// @route   POST /api/messages/private/:receiverId
// @access  Private
exports.sendPrivateMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const senderId = req.user._id;
    const receiverId = req.params.receiverId;

    // Vérifier si le destinataire existe
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Destinataire non trouvé",
      });
    }

    // Vérifier si l'utilisateur est bloqué par le destinataire
    if (receiver.blockedUsers.includes(senderId)) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez pas envoyer de message à cet utilisateur",
      });
    }

    // Vérifier si le destinataire est bloqué par l'expéditeur
    const sender = await User.findById(senderId);
    if (sender.blockedUsers.includes(receiverId)) {
      return res.status(403).json({
        success: false,
        message: "Vous avez bloqué cet utilisateur",
      });
    }

    // Vérifier qu'il y a du contenu ou un fichier média
    if (!content && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Le message doit contenir du texte ou un fichier média",
      });
    }

    // Créer le message
    const messageData = {
      sender: senderId,
      receiver: receiverId,
      content: content || "",
    };

    // Ajouter le média si présent
    if (req.file) {
      messageData.media = {
        url: req.file.filename,
        type: req.file.mimetype.split("/")[0], // 'image', 'video', 'audio', etc.
      };
    }

    const message = await Message.create(messageData);

    // Récupérer le message avec les informations de l'expéditeur
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "username profilePicture")
      .populate("receiver", "username profilePicture");

    // Envoyer le message en temps réel via Socket.IO
    try {
      const socketUtils = require("../utils/socket");
      const io = socketUtils.getIo();
      const onlineUsers = socketUtils.getOnlineUsers();
      const receiverSocketId = onlineUsers.get(receiverId);
      const senderSocketId = onlineUsers.get(senderId.toString());

      // Émettre le message privé au destinataire
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("privateMessage", {
          senderId,
          content: content || "",
          messageId: message._id,
          media: req.file
            ? {
                url: `/uploads/messages/${req.file.filename}`,
                type: req.file.mimetype.split("/")[0],
              }
            : null,
          timestamp: message.createdAt.toISOString(),
        });
      }

      // Émettre la mise à jour de la liste de messages pour les deux utilisateurs
      const messageListData = {
        senderId: senderId.toString(),
        lastMessage:
          content ||
          (req.file ? `${req.file.mimetype.split("/")[0]} envoyé` : ""),
        timestamp: message.createdAt.toISOString(),
        isUnread: true,
      };

      // Pour le destinataire
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageListUpdate", messageListData);
      }

      // Pour l'expéditeur (marquer comme lu)
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageListUpdate", {
          ...messageListData,
          senderId: receiverId.toString(),
          isUnread: false,
        });
      }
    } catch (socketError) {
      console.error(
        "Erreur lors de l'envoi du message via Socket.IO:",
        socketError
      );
    }

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi du message privé:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi du message privé",
    });
  }
};

// @desc    Envoyer un message dans une salle de chat
// @route   POST /api/messages/room/:roomId
// @access  Private
exports.sendRoomMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const senderId = req.user._id;
    const roomId = req.params.roomId;

    // Vérifier si la salle existe
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: "Salle de chat non trouvée",
      });
    }

    // Vérifier si l'utilisateur est membre de la salle
    if (!chatRoom.members.includes(senderId)) {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas membre de cette salle de chat",
      });
    }

    // Vérifier qu'il y a du contenu ou un fichier média
    if (!content && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Le message doit contenir du texte ou un fichier média",
      });
    }

    // Créer le message
    const messageData = {
      sender: senderId,
      chatRoom: roomId,
      content: content || "",
    };

    // Ajouter le média si présent
    if (req.file) {
      messageData.media = {
        url: req.file.filename,
        type: req.file.mimetype.split("/")[0], // 'image', 'video', 'audio', etc.
      };
    }

    const message = await Message.create(messageData);

    // Mettre à jour le dernier message et l'activité de la salle
    await chatRoom.updateLastMessage(message._id);

    // Récupérer le message avec les informations de l'expéditeur
    const populatedMessage = await Message.findById(message._id).populate(
      "sender",
      "username profilePicture"
    );

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi du message dans la salle:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi du message dans la salle",
    });
  }
};

// @desc    Récupérer les messages privés entre deux utilisateurs
// @route   GET /api/messages/private/:userId
// @access  Private
exports.getPrivateMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const startIndex = (page - 1) * limit;

    // Vérifier si l'autre utilisateur existe
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Construire la requête pour récupérer les messages entre les deux utilisateurs
    const query = {
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId },
      ],
      isDeleted: false,
    };

    // Compter le nombre total de messages
    const total = await Message.countDocuments(query);

    // Récupérer les messages avec pagination
    const messages = await Message.find(query)
      .populate("sender", "username profilePicture")
      .sort({ createdAt: -1 }) // Du plus récent au plus ancien
      .skip(startIndex)
      .limit(limit);

    // Marquer les messages non lus comme lus
    await Message.updateMany(
      {
        sender: otherUserId,
        receiver: currentUserId,
        isRead: false,
      },
      { isRead: true }
    );

    // Informations de pagination
    const pagination = {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };

    res.status(200).json({
      success: true,
      pagination,
      data: messages.reverse(), // Inverser pour afficher du plus ancien au plus récent
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des messages privés:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des messages privés",
    });
  }
};

// @desc    Récupérer les messages d'une salle de chat
// @route   GET /api/messages/room/:roomId
// @access  Private
exports.getRoomMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const roomId = req.params.roomId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const startIndex = (page - 1) * limit;

    // Vérifier si la salle existe
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: "Salle de chat non trouvée",
      });
    }

    // Vérifier si l'utilisateur est membre de la salle
    if (!chatRoom.members.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas membre de cette salle de chat",
      });
    }

    // Récupérer les messages de la salle
    const query = {
      chatRoom: roomId,
      isDeleted: false,
    };

    // Compter le nombre total de messages
    const total = await Message.countDocuments(query);

    // Récupérer les messages avec pagination
    const messages = await Message.find(query)
      .populate("sender", "username profilePicture")
      .sort({ createdAt: -1 }) // Du plus récent au plus ancien
      .skip(startIndex)
      .limit(limit);

    // Marquer les messages non lus comme lus
    await Message.updateMany(
      {
        chatRoom: roomId,
        "readBy.user": { $ne: userId },
        sender: { $ne: userId },
      },
      { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
    );

    // Informations de pagination
    const pagination = {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };

    res.status(200).json({
      success: true,
      pagination,
      data: messages.reverse(), // Inverser pour afficher du plus ancien au plus récent
    });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des messages de la salle:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des messages de la salle",
    });
  }
};

// @desc    Supprimer un message (soft delete)
// @route   DELETE /api/messages/:id
// @access  Private
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id;

    // Récupérer le message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message non trouvé",
      });
    }

    // Vérifier si l'utilisateur est l'expéditeur du message
    const isSender = message.sender.toString() === userId.toString();

    // Vérifier si l'utilisateur est admin de la salle (si c'est un message de salle)
    let isRoomAdmin = false;
    if (message.chatRoom) {
      const chatRoom = await ChatRoom.findById(message.chatRoom);
      if (chatRoom && chatRoom.admins.includes(userId)) {
        isRoomAdmin = true;
      }
    }

    // Autoriser la suppression seulement si l'utilisateur est l'expéditeur ou un admin de la salle
    if (!isSender && !isRoomAdmin) {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à supprimer ce message",
      });
    }

    // Supprimer le fichier média associé si existant
    if (message.media && message.media.url) {
      const mediaPath = path.join(
        __dirname,
        "../uploads/messages",
        path.basename(message.media.url)
      );
      if (fs.existsSync(mediaPath)) {
        fs.unlinkSync(mediaPath);
      }
    }

    // Marquer le message comme supprimé
    message.isDeleted = true;
    message.content = "Ce message a été supprimé";
    message.media = undefined;
    await message.save();

    res.status(200).json({
      success: true,
      message: "Message supprimé avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du message:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression du message",
    });
  }
};

// @desc    Ajouter une réaction à un message
// @route   POST /api/messages/:id/reactions
// @access  Private
exports.addReaction = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: "L'emoji est requis",
      });
    }

    // Récupérer le message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message non trouvé",
      });
    }

    // Vérifier si l'utilisateur a accès au message
    if (message.chatRoom) {
      // Message de salle
      const chatRoom = await ChatRoom.findById(message.chatRoom);
      if (!chatRoom || !chatRoom.members.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: "Vous n'avez pas accès à ce message",
        });
      }
    } else {
      // Message privé
      const isParticipant = [
        message.sender.toString(),
        message.receiver.toString(),
      ].includes(userId.toString());

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: "Vous n'avez pas accès à ce message",
        });
      }
    }

    // Ajouter la réaction
    await message.addReaction(userId, emoji);

    // Récupérer le message mis à jour
    const updatedMessage = await Message.findById(messageId)
      .populate("sender", "username profilePicture")
      .populate("reactions.user", "username profilePicture");

    res.status(200).json({
      success: true,
      data: updatedMessage,
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout de la réaction:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'ajout de la réaction",
    });
  }
};

// @desc    Marquer un message comme lu
// @route   PUT /api/messages/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id;

    // Récupérer le message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message non trouvé",
      });
    }

    // Vérifier si l'utilisateur a accès au message
    if (message.chatRoom) {
      // Message de salle
      const chatRoom = await ChatRoom.findById(message.chatRoom);
      if (!chatRoom || !chatRoom.members.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: "Vous n'avez pas accès à ce message",
        });
      }
    } else {
      // Message privé
      if (message.receiver.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Vous n'êtes pas le destinataire de ce message",
        });
      }
    }

    // Marquer le message comme lu
    await message.markAsRead(userId);

    res.status(200).json({
      success: true,
      message: "Message marqué comme lu",
    });
  } catch (error) {
    console.error("Erreur lors du marquage du message comme lu:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors du marquage du message comme lu",
    });
  }
};

// @desc    Marquer un message audio comme joué et le supprimer du chat
// @route   PUT /api/messages/:id/play
// @access  Private
exports.markAsPlayed = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id;

    // Récupérer le message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message non trouvé",
      });
    }

    // Vérifier si l'utilisateur a accès au message
    if (message.chatRoom) {
      // Message de salle
      const chatRoom = await ChatRoom.findById(message.chatRoom);
      if (!chatRoom || !chatRoom.members.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: "Vous n'avez pas accès à ce message",
        });
      }
    } else {
      // Message privé
      if (message.receiver.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Vous n'êtes pas le destinataire de ce message",
        });
      }
    }

    // Vérifier si le message est un message audio
    if (message.mediaType !== "audio") {
      return res.status(400).json({
        success: false,
        message: "Ce message n'est pas un message audio",
      });
    }

    // Marquer le message comme joué uniquement
    message.isPlayed = true;
    message.content = "Message vocal écouté";
    await message.save();

    res.status(200).json({
      success: true,
      message: "Message audio marqué comme joué",
    });
  } catch (error) {
    console.error(
      "Erreur lors du marquage du message audio comme joué:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Erreur lors du marquage du message audio comme joué",
    });
  }
};

// @desc    Envoyer un message vocal privé à un utilisateur
// @route   POST /api/messages/private/:receiverId/voice
// @access  Private
exports.sendPrivateVoiceMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const receiverId = req.params.receiverId;

    // Vérifier si le destinataire existe
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Destinataire non trouvé",
      });
    }

    // Vérifier si l'utilisateur est bloqué par le destinataire
    if (receiver.blockedUsers.includes(senderId)) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez pas envoyer de message à cet utilisateur",
      });
    }

    // Vérifier si le destinataire est bloqué par l'expéditeur
    const sender = await User.findById(senderId);
    if (sender.blockedUsers.includes(receiverId)) {
      return res.status(403).json({
        success: false,
        message: "Vous avez bloqué cet utilisateur",
      });
    }

    // Vérifier qu'il y a un fichier audio
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Un fichier audio est requis pour un message vocal",
      });
    }

    // Créer le message
    const messageData = {
      sender: senderId,
      receiver: receiverId,
      content: "Message vocal",
      mediaUrl: req.file.filename,
      mediaType: "audio",
    };

    const message = await Message.create(messageData);

    // Récupérer le message avec les informations de l'expéditeur
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "username profilePicture")
      .populate("receiver", "username profilePicture");

    // Envoyer le message en temps réel via Socket.IO
    try {
      const socketUtils = require("../utils/socket");
      const io = socketUtils.getIo();
      const onlineUsers = socketUtils.getOnlineUsers();
      const receiverSocketId = onlineUsers.get(receiverId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("privateMessage", {
          senderId,
          content: "Message vocal",
          messageId: message._id,
          media: {
            url: `/uploads/messages/${req.file.filename}`,
            type: "audio",
          },
          timestamp: message.createdAt.toISOString(),
        });
      }
    } catch (socketError) {
      console.error(
        "Erreur lors de l'envoi du message vocal via Socket.IO:",
        socketError
      );
    }

    res.status(201).json({
      success: true,
      message: {
        id: message._id,
        audioUrl: `/uploads/messages/${req.file.filename}`,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi du message vocal privé:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi du message vocal privé",
    });
  }
};

// @desc    Envoyer un fichier média dans un message privé
// @route   POST /api/messages/private/:receiverId/upload
// @access  Private
exports.uploadMediaMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const receiverId = req.params.receiverId;

    // Vérifier si le destinataire existe
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Destinataire non trouvé",
      });
    }

    // Vérifier si l'utilisateur est bloqué par le destinataire
    if (receiver.blockedUsers.includes(senderId)) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez pas envoyer de message à cet utilisateur",
      });
    }

    // Vérifier si le destinataire est bloqué par l'expéditeur
    const sender = await User.findById(senderId);
    if (sender.blockedUsers.includes(receiverId)) {
      return res.status(403).json({
        success: false,
        message: "Vous avez bloqué cet utilisateur",
      });
    }

    // Vérifier qu'il y a un fichier média
    if (!req.file) {
      console.log("No file uploaded in request");
      return res.status(400).json({
        success: false,
        message: "Un fichier média est requis",
      });
    }

    console.log("File uploaded:", req.file);
    // Déterminer le type de média
    const mimeType = req.file.mimetype;
    let mediaType = mimeType.split("/")[0]; // 'image', 'video', 'audio', etc.
    if (mediaType === "application") {
      mediaType = "document";
    }

    // Déplacer le fichier temporaire vers un emplacement permanent
    const tempPath = req.file.path;
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(req.file.originalname);
    const permanentFilename = `${uniqueSuffix}${ext}`;
    const permanentPath = path.join(
      __dirname,
      "../uploads/messages",
      permanentFilename
    );

    // Créer le dossier uploads/messages s'il n'existe pas
    const messagesDir = path.dirname(permanentPath);
    if (!fs.existsSync(messagesDir)) {
      fs.mkdirSync(messagesDir, { recursive: true });
    }

    // Déplacer le fichier (utiliser copyFileSync et unlinkSync pour gérer les opérations cross-device)
    fs.copyFileSync(tempPath, permanentPath);
    fs.unlinkSync(tempPath);

    // Créer le message avec le nom de fichier permanent
    const messageData = {
      sender: senderId,
      receiver: receiverId,
      content:
        mediaType.charAt(0).toUpperCase() + mediaType.slice(1) + " envoyé",
      mediaUrl: permanentFilename,
      mediaType: mediaType,
    };

    const message = await Message.create(messageData);

    // Récupérer le message avec les informations de l'expéditeur
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "username profilePicture")
      .populate("receiver", "username profilePicture");

    // Envoyer le message en temps réel via Socket.IO
    try {
      const socketUtils = require("../utils/socket");
      const io = socketUtils.getIo();
      const onlineUsers = socketUtils.getOnlineUsers();
      const receiverSocketId = onlineUsers.get(receiverId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("privateMessage", {
          senderId,
          content:
            mediaType.charAt(0).toUpperCase() + mediaType.slice(1) + " envoyé",
          messageId: message._id,
          media: {
            url: `https://chatapp-shi2.onrender.com/uploads/messages/${permanentFilename}`,
            type: mediaType,
          },
          timestamp: message.createdAt.toISOString(),
        });
      }
    } catch (socketError) {
      console.error(
        "Erreur lors de l'envoi du fichier média via Socket.IO:",
        socketError
      );
    }

    res.status(201).json({
      success: true,
      message: {
        id: message._id,
        fileUrl: `https://chatapp-shi2.onrender.com/uploads/messages/${permanentFilename}`,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi du fichier média:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi du fichier média",
    });
  }
};

// @desc    Récupérer les derniers messages de toutes les conversations privées
// @route   GET /api/messages/last-messages
// @access  Private
exports.getLastMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const limitPerConversation = parseInt(req.query.limit, 10) || 1;

    // Agréger pour obtenir le dernier message de chaque conversation
    const lastMessages = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: userId }, { receiver: userId }],
          isDeleted: false,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"],
          },
          lastMessage: { $first: "$$ROOT" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          "lastMessage.sender": 1,
          "lastMessage.receiver": 1,
          "lastMessage.content": 1,
          "lastMessage.createdAt": 1,
          "lastMessage.isRead": 1,
          "user._id": 1,
          "user.username": 1,
          "user.profilePicture": 1,
        },
      },
      {
        $sort: { "lastMessage.createdAt": -1 },
      },
    ]);

    res.status(200).json({
      success: true,
      data: lastMessages,
    });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des derniers messages:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des derniers messages",
    });
  }
};

// @desc    Récupérer les données partagées (médias) d'une conversation privée
// @route   GET /api/messages/shared/:userId
// @access  Private
exports.getSharedData = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const startIndex = (page - 1) * limit;

    // Vérifier si l'autre utilisateur existe
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Construire la requête pour récupérer les messages avec médias entre les deux utilisateurs
    const query = {
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId },
      ],
      isDeleted: false,
      media: { $exists: true, $ne: null },
    };

    // Compter le nombre total de messages avec médias
    const total = await Message.countDocuments(query);

    // Récupérer les messages avec pagination
    const sharedData = await Message.find(query)
      .populate("sender", "username profilePicture")
      .sort({ createdAt: -1 }) // Du plus récent au plus ancien
      .skip(startIndex)
      .limit(limit)
      .select("sender media createdAt");

    // Informations de pagination
    const pagination = {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };

    res.status(200).json({
      success: true,
      pagination,
      data: sharedData,
    });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des données partagées:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des données partagées",
    });
  }
};
