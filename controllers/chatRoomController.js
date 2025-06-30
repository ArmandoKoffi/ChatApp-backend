const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');
const Message = require('../models/Message');
const fs = require('fs');
const path = require('path');

// @desc    Créer une nouvelle salle de chat
// @route   POST /api/chatrooms
// @access  Private
exports.createChatRoom = async (req, res) => {
  try {
    const { name, description, type, members } = req.body;
    const creatorId = req.user._id;
    
    // Vérifier le type de salle
    if (!['public', 'private', 'direct'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type de salle invalide. Les types valides sont: public, private, direct'
      });
    }
    
    // Pour les salles directes, vérifier qu'il y a exactement un membre
    if (type === 'direct' && (!members || members.length !== 1)) {
      return res.status(400).json({
        success: false,
        message: 'Les salles directes doivent avoir exactement un membre en plus du créateur'
      });
    }
    
    // Vérifier si les membres existent
    if (members && members.length > 0) {
      const memberIds = Array.isArray(members) ? members : [members];
      const existingUsers = await User.countDocuments({
        _id: { $in: memberIds }
      });
      
      if (existingUsers !== memberIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Un ou plusieurs membres n\'existent pas'
        });
      }
    }
    
    // Créer la salle de chat
    const chatRoomData = {
      name,
      description,
      type,
      creator: creatorId,
      members: [creatorId],
      admins: [creatorId]
    };
    
    // Ajouter les membres s'ils existent
    if (members && members.length > 0) {
      const memberIds = Array.isArray(members) ? members : [members];
      // Éviter les doublons
      memberIds.forEach(memberId => {
        if (!chatRoomData.members.includes(memberId)) {
          chatRoomData.members.push(memberId);
        }
      });
    }
    
    // Ajouter l'avatar si présent
    if (req.file) {
      chatRoomData.avatar = req.file.filename;
    }
    
    const chatRoom = await ChatRoom.create(chatRoomData);
    
    // Récupérer la salle avec les informations du créateur
    const populatedChatRoom = await ChatRoom.findById(chatRoom._id)
      .populate('creator', 'username profilePicture')
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture');
    
    res.status(201).json({
      success: true,
      data: populatedChatRoom
    });
  } catch (error) {
    console.error('Erreur lors de la création de la salle de chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la salle de chat'
    });
  }
};

// @desc    Récupérer toutes les salles de chat
// @route   GET /api/chatrooms
// @access  Private
exports.getChatRooms = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const type = req.query.type;
    const search = req.query.search;
    
    // Construire la requête de base
    const query = {
      $or: [
        { members: userId },
        { type: 'public' }
      ]
    };
    
    // Filtrer par type si spécifié
    if (type && ['public', 'private', 'direct'].includes(type)) {
      query.type = type;
    }
    
    // Recherche par nom ou description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Compter le nombre total de salles
    const total = await ChatRoom.countDocuments(query);
    
    // Récupérer les salles avec pagination
    const chatRooms = await ChatRoom.find(query)
      .populate('creator', 'username profilePicture')
      .populate('lastMessage')
      .sort({ lastActivity: -1 })
      .skip(startIndex)
      .limit(limit);
    
    // Informations de pagination
    const pagination = {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    };
    
    res.status(200).json({
      success: true,
      pagination,
      data: chatRooms
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des salles de chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des salles de chat'
    });
  }
};

// @desc    Récupérer une salle de chat par son ID
// @route   GET /api/chatrooms/:id
// @access  Private
exports.getChatRoomById = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    
    const chatRoom = await ChatRoom.findById(roomId)
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture')
      .populate('creator', 'username profilePicture')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'sender',
          select: 'username profilePicture'
        }
      });
    
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier l'accès pour les salles privées
    if (chatRoom.type === 'private' && !chatRoom.members.some(member => member._id.toString() === userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas accès à cette salle de chat'
      });
    }
    
    res.status(200).json({
      success: true,
      data: chatRoom
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la salle de chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la salle de chat'
    });
  }
};

// @desc    Mettre à jour une salle de chat
// @route   PUT /api/chatrooms/:id
// @access  Private (Admin seulement)
exports.updateChatRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    const { name, description } = req.body;
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si l'utilisateur est un administrateur
    if (!chatRoom.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à modifier cette salle de chat'
      });
    }
    
    // Mettre à jour les champs
    if (name) chatRoom.name = name;
    if (description) chatRoom.description = description;
    
    // Gérer l'avatar
    if (req.file) {
      // Supprimer l'ancien avatar s'il existe
      if (chatRoom.avatar) {
        const oldAvatarPath = path.join(__dirname, '../uploads/rooms', chatRoom.avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }
      
      // Mettre à jour avec le nouvel avatar
      chatRoom.avatar = req.file.filename;
    }
    
    await chatRoom.save();
    
    // Récupérer la salle mise à jour avec les informations des membres
    const updatedChatRoom = await ChatRoom.findById(roomId)
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture')
      .populate('creator', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedChatRoom
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la salle de chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la salle de chat'
    });
  }
};

// @desc    Supprimer une salle de chat
// @route   DELETE /api/chatrooms/:id
// @access  Private (Créateur seulement)
exports.deleteChatRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si l'utilisateur est le créateur
    if (chatRoom.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le créateur peut supprimer cette salle de chat'
      });
    }
    
    // Supprimer l'avatar s'il existe
    if (chatRoom.avatar) {
      const avatarPath = path.join(__dirname, '../uploads/rooms', chatRoom.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
    
    // Marquer tous les messages de la salle comme supprimés
    await Message.updateMany(
      { chatRoom: roomId },
      { isDeleted: true, content: 'Ce message a été supprimé' }
    );
    
    // Supprimer la salle
    await chatRoom.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Salle de chat supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la salle de chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la salle de chat'
    });
  }
};

// @desc    Ajouter un membre à une salle de chat
// @route   POST /api/chatrooms/:id/members
// @access  Private (Admin seulement pour les salles privées)
exports.addMember = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    const { memberId } = req.body;
    
    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID du membre est requis'
      });
    }
    
    // Vérifier si l'utilisateur à ajouter existe
    const memberToAdd = await User.findById(memberId);
    if (!memberToAdd) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si l'utilisateur est déjà membre
    if (chatRoom.members.includes(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'L\'utilisateur est déjà membre de cette salle'
      });
    }
    
    // Pour les salles privées, vérifier si l'utilisateur est un administrateur
    if (chatRoom.type === 'private' && !chatRoom.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à ajouter des membres à cette salle'
      });
    }
    
    // Ajouter le membre
    chatRoom.members.push(memberId);
    await chatRoom.save();
    
    // Récupérer la salle mise à jour avec les informations des membres
    const updatedChatRoom = await ChatRoom.findById(roomId)
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture')
      .populate('creator', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedChatRoom
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du membre:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout du membre'
    });
  }
};

// @desc    Retirer un membre d'une salle de chat
// @route   DELETE /api/chatrooms/:id/members/:memberId
// @access  Private (Admin ou le membre lui-même)
exports.removeMember = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    const memberId = req.params.memberId;
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si l'utilisateur est membre
    if (!chatRoom.members.includes(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'L\'utilisateur n\'est pas membre de cette salle'
      });
    }
    
    // Vérifier si l'utilisateur est le créateur (ne peut pas être retiré)
    if (chatRoom.creator.toString() === memberId) {
      return res.status(403).json({
        success: false,
        message: 'Le créateur ne peut pas être retiré de la salle'
      });
    }
    
    // Autoriser le retrait si l'utilisateur se retire lui-même ou est un administrateur
    const isSelfRemoval = userId.toString() === memberId;
    const isAdmin = chatRoom.admins.includes(userId);
    
    if (!isSelfRemoval && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à retirer ce membre'
      });
    }
    
    // Retirer le membre
    chatRoom.members = chatRoom.members.filter(
      member => member.toString() !== memberId
    );
    
    // Retirer également des administrateurs si nécessaire
    if (chatRoom.admins.includes(memberId)) {
      chatRoom.admins = chatRoom.admins.filter(
        admin => admin.toString() !== memberId
      );
    }
    
    await chatRoom.save();
    
    // Récupérer la salle mise à jour avec les informations des membres
    const updatedChatRoom = await ChatRoom.findById(roomId)
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture')
      .populate('creator', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedChatRoom
    });
  } catch (error) {
    console.error('Erreur lors du retrait du membre:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du retrait du membre'
    });
  }
};

// @desc    Promouvoir un membre au rang d'administrateur
// @route   POST /api/chatrooms/:id/admins
// @access  Private (Créateur seulement)
exports.promoteToAdmin = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    const { memberId } = req.body;
    
    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID du membre est requis'
      });
    }
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si l'utilisateur est le créateur
    if (chatRoom.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le créateur peut promouvoir des administrateurs'
      });
    }
    
    // Vérifier si l'utilisateur est membre
    if (!chatRoom.members.includes(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'L\'utilisateur n\'est pas membre de cette salle'
      });
    }
    
    // Vérifier si l'utilisateur est déjà administrateur
    if (chatRoom.admins.includes(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'L\'utilisateur est déjà administrateur'
      });
    }
    
    // Promouvoir l'utilisateur
    chatRoom.admins.push(memberId);
    await chatRoom.save();
    
    // Récupérer la salle mise à jour avec les informations des membres
    const updatedChatRoom = await ChatRoom.findById(roomId)
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture')
      .populate('creator', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedChatRoom
    });
  } catch (error) {
    console.error('Erreur lors de la promotion de l\'administrateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la promotion de l\'administrateur'
    });
  }
};

// @desc    Rétrograder un administrateur
// @route   DELETE /api/chatrooms/:id/admins/:adminId
// @access  Private (Créateur seulement)
exports.demoteFromAdmin = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    const adminId = req.params.adminId;
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si l'utilisateur est le créateur
    if (chatRoom.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le créateur peut rétrograder des administrateurs'
      });
    }
    
    // Vérifier si l'administrateur à rétrograder est le créateur
    if (chatRoom.creator.toString() === adminId) {
      return res.status(403).json({
        success: false,
        message: 'Le créateur ne peut pas être rétrogradé'
      });
    }
    
    // Vérifier si l'utilisateur est administrateur
    if (!chatRoom.admins.includes(adminId)) {
      return res.status(400).json({
        success: false,
        message: 'L\'utilisateur n\'est pas administrateur'
      });
    }
    
    // Rétrograder l'administrateur
    chatRoom.admins = chatRoom.admins.filter(
      admin => admin.toString() !== adminId
    );
    
    await chatRoom.save();
    
    // Récupérer la salle mise à jour avec les informations des membres
    const updatedChatRoom = await ChatRoom.findById(roomId)
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture')
      .populate('creator', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedChatRoom
    });
  } catch (error) {
    console.error('Erreur lors de la rétrogradation de l\'administrateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la rétrogradation de l\'administrateur'
    });
  }
};

// @desc    Rejoindre une salle de chat publique
// @route   POST /api/chatrooms/:id/join
// @access  Private
exports.joinChatRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si la salle est publique
    if (chatRoom.type !== 'public') {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez rejoindre que des salles publiques'
      });
    }
    
    // Vérifier si l'utilisateur est déjà membre
    if (chatRoom.members.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Vous êtes déjà membre de cette salle'
      });
    }
    
    // Ajouter l'utilisateur aux membres
    chatRoom.members.push(userId);
    await chatRoom.save();
    
    // Récupérer la salle mise à jour avec les informations des membres
    const updatedChatRoom = await ChatRoom.findById(roomId)
      .populate('members', 'username profilePicture isOnline lastActive')
      .populate('admins', 'username profilePicture')
      .populate('creator', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedChatRoom
    });
  } catch (error) {
    console.error('Erreur lors de l\'adhésion à la salle de chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'adhésion à la salle de chat'
    });
  }
};

// @desc    Quitter une salle de chat
// @route   POST /api/chatrooms/:id/leave
// @access  Private
exports.leaveChatRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.user._id;
    
    // Récupérer la salle
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Salle de chat non trouvée'
      });
    }
    
    // Vérifier si l'utilisateur est membre
    if (!chatRoom.members.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Vous n\'êtes pas membre de cette salle'
      });
    }
    
    // Vérifier si l'utilisateur est le créateur
    if (chatRoom.creator.toString() === userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Le créateur ne peut pas quitter la salle. Supprimez-la ou transférez la propriété.'
      });
    }
    
    // Retirer l'utilisateur des membres
    chatRoom.members = chatRoom.members.filter(
      member => member.toString() !== userId.toString()
    );
    
    // Retirer également des administrateurs si nécessaire
    if (chatRoom.admins.includes(userId)) {
      chatRoom.admins = chatRoom.admins.filter(
        admin => admin.toString() !== userId.toString()
      );
    }
    
    await chatRoom.save();
    
    res.status(200).json({
      success: true,
      message: 'Vous avez quitté la salle avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la sortie de la salle de chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la sortie de la salle de chat'
    });
  }
};