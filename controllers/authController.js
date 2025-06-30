const User = require('../models/User');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const { uploadToCloudinary, getDecryptedUrl } = require('../utils/cloudinary');
const { sendPasswordResetEmail, generateSecurePassword } = require('../utils/email');

// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// Envoyer le token dans un cookie et dans la réponse
const sendTokenResponse = (user, statusCode, res) => {
  // Créer le token
  const token = generateToken(user._id);

  // Options pour le cookie
  const options = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  // Obtenir l'URL déchiffrée de l'image de profil si nécessaire
  let profilePicture = user.profilePicture;
  if (user.profilePictureSecure && profilePicture) {
    profilePicture = getDecryptedUrl(profilePicture, user.profilePictureSecure);
  }

  // Envoyer le cookie et la réponse
  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        gender: user.gender,
        profilePicture: profilePicture,
        bio: user.bio,
        interests: user.interests,
        role: user.role,
        isOnline: user.isOnline
      }
    });
};

// @desc    Inscription d'un utilisateur
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { username, email, password, gender, age, interests, intentions, location } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email 
          ? 'Cet email est déjà utilisé' 
          : 'Ce nom d\'utilisateur est déjà utilisé'
      });
    }

    // Déterminer l'image de profil par défaut en fonction du genre
    let defaultProfilePicture = 'default-other.png';
    if (gender === 'male') {
      defaultProfilePicture = 'default-male.png';
    } else if (gender === 'female') {
      defaultProfilePicture = 'default-female.png';
    }

    // Créer un nouvel utilisateur
    const user = await User.create({
      username,
      email,
      password,
      gender: gender || 'other',
      age: age || undefined,
      interests: interests || [],
      intentions: intentions || undefined,
      location: location || undefined,
      profilePicture: defaultProfilePicture,
      isOnline: true
    });

    // Si un fichier a été téléchargé, le traiter et mettre à jour l'utilisateur
    if (req.file) {
      try {
        // Télécharger l'image sur Cloudinary
        const result = await uploadToCloudinary(req.file.path, 'profiles', true);
        
        // Mettre à jour l'utilisateur avec l'URL de l'image
        user.profilePicture = result.url;
        user.profilePictureId = result.public_id;
        user.profilePictureSecure = result.secure;
        await user.save();
      } catch (uploadError) {
        console.error('Erreur lors du téléchargement de l\'image:', uploadError);
        // Continuer avec l'image par défaut en cas d'erreur
      }
    }

    // Envoyer le token
    sendTokenResponse(user, 201, res);
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'inscription',
      error: process.env.NODE_ENV === 'production' ? error.message : undefined
    });
  }
};

// @desc    Connexion d'un utilisateur
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le mot de passe est correct
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
    await user.save();

    // Envoyer le token
    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion',
      error: process.env.NODE_ENV === 'production' ? error.message : undefined
    });
  }
};

// @desc    Déconnexion d'un utilisateur
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    // Mettre à jour le statut en ligne de manière non bloquante
    if (req.user && req.user._id) {
      User.findByIdAndUpdate(req.user._id, {
        isOnline: false,
        lastActive: Date.now()
      }).catch(err => {
        console.error('Erreur lors de la mise à jour du statut en ligne:', err);
      });
    }

    // Détruire la session si elle existe de manière non bloquante
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Erreur lors de la destruction de la session:', err);
        }
      });
    }

    // Supprimer le cookie
    res.cookie('token', 'none', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    // Répondre immédiatement pour éviter tout blocage
    res.status(200).json({
      success: true,
      message: 'Déconnexion réussie',
      action: 'emitLogoutEvent' // Instruction for frontend to emit logout event via Socket.IO
    });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la déconnexion',
      error: process.env.NODE_ENV === 'production' ? error.message : undefined
    });
  }
};

// @desc    Obtenir l'utilisateur actuellement connecté
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // Vérifier si req.user existe et a un _id
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié ou token invalide'
      });
    }

    const user = await User.findById(req.user._id).select('-password');
    
    // Vérifier si l'utilisateur existe dans la base de données
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
        // Continuer avec l'URL chiffrée ou une valeur par défaut si le déchiffrement échoue
        user.profilePicture = user.profilePicture || '';
      }
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
      error: process.env.NODE_ENV === 'production' ? error.message : undefined
    });
  }
};

// @desc    Mot de passe oublié
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Aucun utilisateur trouvé avec cet email'
      });
    }

    // Générer un nouveau mot de passe
    const newPassword = generateSecurePassword();

    // Mettre à jour le mot de passe de l'utilisateur
    user.password = newPassword;
    await user.save();

    // Envoyer l'email avec le nouveau mot de passe
    await sendPasswordResetEmail({
      email: user.email,
      username: user.username,
      password: newPassword
    });

    res.status(200).json({
      success: true,
      message: 'Un email avec les instructions de réinitialisation a été envoyé'
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réinitialisation du mot de passe',
      error: process.env.NODE_ENV === 'production' ? error.message : undefined
    });
  }
};
