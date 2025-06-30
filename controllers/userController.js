const User = require('../models/User');
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { uploadToCloudinary, removeFromCloudinary, getDecryptedUrl } = require('../utils/cloudinary');
const { cleanupTempFile } = require('../middleware/upload');

// @desc    Inscription d'un nouvel utilisateur
// @route   POST /api/users/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Vérifier si l'utilisateur existe déjà
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: userExists.email === email 
          ? 'Cet email est déjà utilisé' 
          : 'Ce nom d\'utilisateur est déjà utilisé'
      });
    }
    
    // Créer un nouvel utilisateur
    const user = await User.create({
      username,
      email,
      password
    });
    
    // Générer un token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isOnline: user.isOnline,
        token
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'inscription'
    });
  }
};

// @desc    Connexion d'un utilisateur
// @route   POST /api/users/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }
    
    // Vérifier le mot de passe
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }
    
    // Mettre à jour le statut en ligne
    user.isOnline = true;
    user.lastActive = Date.now();
    await user.save({ validateBeforeSave: false });
    
    // Générer un token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isOnline: user.isOnline,
        token
      }
    });
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion'
    });
  }
};

// @desc    Déconnexion d'un utilisateur
// @route   POST /api/users/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    // Mettre à jour le statut hors ligne
    const user = await User.findById(req.user._id);
    user.isOnline = false;
    user.lastActive = Date.now();
    await user.save({ validateBeforeSave: false });
    
    res.status(200).json({
      success: true,
      message: 'Déconnexion réussie'
    });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la déconnexion'
    });
  }
};

// @desc    Obtenir le profil d'un utilisateur ou de l'utilisateur actuel
// @route   GET /api/users/:id (ou /api/users/me pour l'utilisateur actuel)
// @access  Private
exports.getProfile = async (req, res) => {
  try {
    let userId = req.params.id;
    
    // Si l'ID est 'me', utiliser l'ID de l'utilisateur connecté
    if (userId === 'me') {
      userId = req.user._id;
    }
    
    // Vérifier si req.user existe pour éviter des erreurs
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié ou token invalide'
      });
    }
    
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Obtenir l'URL déchiffrée de l'image de profil si nécessaire
    if (user.profilePictureSecure && user.profilePicture) {
      user.profilePicture = getDecryptedUrl(user.profilePicture, user.profilePictureSecure);
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du profil',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Mettre à jour le profil de l'utilisateur
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { username, email, bio, gender, interests, removeProfilePicture, age, location, intentions } = req.body;
    const userId = req.user._id;

    // Vérifier si le nom d'utilisateur ou l'email existe déjà pour un autre utilisateur
    if (username) {
      const existingUsername = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: 'Ce nom d\'utilisateur est déjà utilisé'
        });
      }
    }

    if (email) {
      const existingEmail = await User.findOne({ email, _id: { $ne: userId } });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Cet email est déjà utilisé'
        });
      }
    }

    // Trouver l'utilisateur et mettre à jour ses informations
    const user = await User.findById(userId);

    if (username) user.username = username;
    if (email) user.email = email;
    if (bio !== undefined) user.bio = bio;
    if (gender) user.gender = gender;
    if (age !== undefined) user.age = parseInt(age, 10) || 0;
    if (location !== undefined) user.location = location;
    if (intentions !== undefined) user.intentions = intentions;
    if (interests) {
      // Vérifier que interests est un tableau
      if (Array.isArray(interests)) {
        // Transformer les intérêts en objets avec une propriété label
        user.interests = interests.map(interest => {
          if (typeof interest === 'string') {
            return { label: interest };
          } else if (typeof interest === 'object' && interest.label) {
            return interest;
          } else {
            return { label: interest.toString() };
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Les centres d\'intérêt doivent être fournis sous forme de tableau'
        });
      }
    }

    // Gérer la suppression de l'image de profil si demandé
    if (removeProfilePicture === true) {
      // Si l'utilisateur a une image personnalisée (pas une image par défaut)
      if (user.profilePictureId) {
        // Supprimer l'image de Cloudinary
        await removeFromCloudinary(user.profilePictureId);
      }

      // Déterminer l'image de profil par défaut en fonction du genre
      let defaultProfilePicture = 'default-other.png';
      if (user.gender === 'male') {
        defaultProfilePicture = 'default-male.png';
      } else if (user.gender === 'female') {
        defaultProfilePicture = 'default-female.png';
      }

      // Réinitialiser les champs d'image de profil
      user.profilePicture = defaultProfilePicture;
      user.profilePictureId = '';
      user.profilePictureSecure = false;
    }
    // Gérer le téléchargement d'une nouvelle image de profil
    else if (req.file) {
      try {
        // Si l'utilisateur a déjà une image personnalisée, la supprimer de Cloudinary
        if (user.profilePictureId) {
          await removeFromCloudinary(user.profilePictureId);
        }

        // Télécharger la nouvelle image sur Cloudinary
        const result = await uploadToCloudinary(req.file.path, 'profiles', true);
        
        // Mettre à jour l'utilisateur avec la nouvelle image
        user.profilePicture = result.url;
        user.profilePictureId = result.public_id;
        user.profilePictureSecure = result.secure;

        // Nettoyer le fichier temporaire
        cleanupTempFile(req.file.path);
      } catch (uploadError) {
        console.error('Erreur lors du téléchargement de l\'image:', uploadError);
        return res.status(400).json({
          success: false,
          message: 'Erreur lors du téléchargement de l\'image de profil'
        });
      }
    }

    await user.save();

    // Renvoyer l'utilisateur mis à jour sans le mot de passe
    const updatedUser = await User.findById(userId).select('-password');

    // Obtenir l'URL déchiffrée de l'image de profil si nécessaire
    if (updatedUser.profilePictureSecure && updatedUser.profilePicture) {
      try {
        updatedUser.profilePicture = getDecryptedUrl(updatedUser.profilePicture, updatedUser.profilePictureSecure);
      } catch (decryptError) {
        console.error('Erreur lors du déchiffrement de l\'URL de l\'image de profil:', decryptError);
        updatedUser.profilePicture = updatedUser.profilePicture || '';
      }
    }

    res.status(200).json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du profil',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Changer le mot de passe
// @route   PUT /api/users/password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Vérifier que les deux mots de passe sont fournis
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir le mot de passe actuel et le nouveau mot de passe'
      });
    }
    
    // Récupérer l'utilisateur avec son mot de passe
    const user = await User.findById(req.user._id);
    
    // Vérifier que le mot de passe actuel est correct
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe actuel incorrect'
      });
    }
    
    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Mot de passe mis à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du changement de mot de passe',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Obtenir tous les utilisateurs (pour les contacts)
// @route   GET /api/users
// @access  Private
exports.getAllUsers = async (req, res) => {
  try {
    // Exclure l'utilisateur actuel et récupérer tous les autres utilisateurs
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('_id username email profilePicture isOnline lastActive profilePictureSecure');

    // Déchiffrer les URLs des images de profil si nécessaire
    const usersWithDecryptedImages = users.map(user => {
      const userObj = user.toObject();
      if (userObj.profilePictureSecure && userObj.profilePicture) {
        userObj.profilePicture = getDecryptedUrl(userObj.profilePicture, userObj.profilePictureSecure);
      }
      return userObj;
    });

    res.status(200).json({
      success: true,
      count: usersWithDecryptedImages.length,
      data: usersWithDecryptedImages
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des utilisateurs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Rechercher des utilisateurs
// @route   GET /api/users?search=term&page=1&limit=10
// @access  Private
exports.searchUsers = async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    // Construire la requête de recherche
    const query = {
      _id: { $ne: req.user._id } // Exclure l'utilisateur actuel
    };
    
    // Ajouter la recherche par nom d'utilisateur si spécifiée
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }
    
    // Compter le nombre total d'utilisateurs
    const total = await User.countDocuments(query);
    
    // Récupérer les utilisateurs avec pagination
    const users = await User.find(query)
      .select('username profilePicture isOnline lastActive bio')
      .sort({ username: 1 })
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
      data: users
    });
  } catch (error) {
    console.error('Erreur lors de la recherche d\'utilisateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche d\'utilisateurs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Obtenir un utilisateur par son ID ou l'utilisateur actuel
// @route   GET /api/users/:id (ou /api/users/me pour l'utilisateur actuel)
// @access  Private
exports.getUserById = async (req, res) => {
  try {
    let userId = req.params.id;
    
    // Si l'ID est 'me', utiliser l'ID de l'utilisateur connecté
    if (userId === 'me') {
      userId = req.user._id;
    }
    
    // Vérifier si req.user existe pour éviter des erreurs
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié ou token invalide'
      });
    }
    
    // Vérifier si l'utilisateur existe
    const user = await User.findById(userId)
      .select('username email bio profilePicture isOnline lastActive interests gender')
      .populate('contacts', 'username profilePicture isOnline');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Obtenir l'URL déchiffrée de l'image de profil si nécessaire
    if (user.profilePictureSecure && user.profilePicture) {
      try {
        user.profilePicture = getDecryptedUrl(user.profilePicture, user.profilePictureSecure);
      } catch (decryptError) {
        console.error('Erreur lors du déchiffrement de l\'URL de l\'image de profil:', decryptError);
        user.profilePicture = user.profilePicture || '';
      }
    }
    
    // Vérifier si l'utilisateur est bloqué (seulement si ce n'est pas l'utilisateur actuel)
    let isBlocked = false;
    let hasBlocked = false;
    if (userId.toString() !== req.user._id.toString()) {
      const currentUser = await User.findById(req.user._id);
      isBlocked = currentUser.blockedUsers.includes(userId);
      hasBlocked = await User.findOne({
        _id: userId,
        blockedUsers: req.user._id
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        ...user.toObject(),
        isBlocked,
        hasBlocked: !!hasBlocked
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'utilisateur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Ajouter un contact
// @route   POST /api/users/contacts/:id
// @access  Private
exports.addContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    const userId = req.user._id;
    
    // Vérifier si l'utilisateur essaie de s'ajouter lui-même
    if (contactId === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas vous ajouter comme contact'
      });
    }
    
    // Vérifier si le contact existe
    const contact = await User.findById(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Récupérer l'utilisateur actuel
    const user = await User.findById(userId);
    
    // Vérifier si le contact est déjà dans la liste
    if (user.contacts.includes(contactId)) {
      return res.status(400).json({
        success: false,
        message: 'Cet utilisateur est déjà dans vos contacts'
      });
    }
    
    // Vérifier si l'utilisateur est bloqué
    if (user.blockedUsers.includes(contactId)) {
      return res.status(400).json({
        success: false,
        message: 'Vous avez bloqué cet utilisateur. Veuillez le débloquer avant de l\'ajouter.'
      });
    }
    
    // Vérifier si l'utilisateur a été bloqué par le contact
    const isBlockedByContact = await User.findOne({
      _id: contactId,
      blockedUsers: userId
    });
    
    if (isBlockedByContact) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas ajouter cet utilisateur'
      });
    }
    
    // Ajouter le contact
    user.contacts.push(contactId);
    await user.save();
    
    // Récupérer la liste des contacts mise à jour
    const updatedUser = await User.findById(userId)
      .populate('contacts', 'username profilePicture isOnline lastActive');
    
    res.status(200).json({
      success: true,
      data: updatedUser.contacts
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du contact:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout du contact'
    });
  }
};

// @desc    Supprimer un contact
// @route   DELETE /api/users/contacts/:id
// @access  Private
exports.removeContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    const userId = req.user._id;
    
    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    
    // Vérifier si le contact est dans la liste
    if (!user.contacts.includes(contactId)) {
      return res.status(400).json({
        success: false,
        message: 'Cet utilisateur n\'est pas dans vos contacts'
      });
    }
    
    // Supprimer le contact
    user.contacts = user.contacts.filter(
      contact => contact.toString() !== contactId
    );
    
    await user.save();
    
    // Récupérer la liste des contacts mise à jour
    const updatedUser = await User.findById(userId)
      .populate('contacts', 'username profilePicture isOnline lastActive');
    
    res.status(200).json({
      success: true,
      data: updatedUser.contacts
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du contact:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du contact'
    });
  }
};

// @desc    Obtenir la liste des contacts
// @route   GET /api/users/contacts
// @access  Private
exports.getContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Récupérer l'utilisateur avec ses contacts
    const user = await User.findById(userId)
      .populate('contacts', 'username profilePicture isOnline lastActive');
    
    res.status(200).json({
      success: true,
      data: user.contacts
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des contacts'
    });
  }
};

// @desc    Bloquer un utilisateur
// @route   POST /api/users/block/:id
// @access  Private
exports.blockUser = async (req, res) => {
  try {
    const blockId = req.params.id;
    const userId = req.user._id;
    
    // Vérifier si l'utilisateur essaie de se bloquer lui-même
    if (blockId === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas vous bloquer vous-même'
      });
    }
    
    // Vérifier si l'utilisateur à bloquer existe
    const userToBlock = await User.findById(blockId);
    if (!userToBlock) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Récupérer l'utilisateur actuel
    const user = await User.findById(userId);
    
    // Vérifier si l'utilisateur est déjà bloqué
    if (user.blockedUsers.includes(blockId)) {
      return res.status(400).json({
        success: false,
        message: 'Cet utilisateur est déjà bloqué'
      });
    }
    
    // Bloquer l'utilisateur
    user.blockedUsers.push(blockId);
    
    // Supprimer l'utilisateur des contacts s'il y est
    if (user.contacts.includes(blockId)) {
      user.contacts = user.contacts.filter(
        contact => contact.toString() !== blockId
      );
    }
    
    await user.save();
    
    // Récupérer la liste des utilisateurs bloqués mise à jour
    const updatedUser = await User.findById(userId)
      .populate('blockedUsers', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedUser.blockedUsers
    });
  } catch (error) {
    console.error('Erreur lors du blocage de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du blocage de l\'utilisateur'
    });
  }
};

// @desc    Débloquer un utilisateur
// @route   DELETE /api/users/block/:id
// @access  Private
exports.unblockUser = async (req, res) => {
  try {
    const unblockId = req.params.id;
    const userId = req.user._id;
    
    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    
    // Vérifier si l'utilisateur est bloqué
    if (!user.blockedUsers.includes(unblockId)) {
      return res.status(400).json({
        success: false,
        message: 'Cet utilisateur n\'est pas bloqué'
      });
    }
    
    // Débloquer l'utilisateur
    user.blockedUsers = user.blockedUsers.filter(
      blocked => blocked.toString() !== unblockId
    );
    
    await user.save();
    
    // Récupérer la liste des utilisateurs bloqués mise à jour
    const updatedUser = await User.findById(userId)
      .populate('blockedUsers', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: updatedUser.blockedUsers
    });
  } catch (error) {
    console.error('Erreur lors du déblocage de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du déblocage de l\'utilisateur'
    });
  }
};

// @desc    Obtenir la liste des utilisateurs bloqués
// @route   GET /api/users/block
// @access  Private
exports.getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Récupérer l'utilisateur avec ses utilisateurs bloqués
    const user = await User.findById(userId)
      .populate('blockedUsers', 'username profilePicture');
    
    res.status(200).json({
      success: true,
      data: user.blockedUsers
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs bloqués:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des utilisateurs bloqués'
    });
  }
};
