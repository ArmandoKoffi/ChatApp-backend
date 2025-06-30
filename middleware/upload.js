const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Utiliser un stockage temporaire pour Multer
const tempDir = os.tmpdir();

// Configuration du stockage temporaire pour les fichiers avant upload sur Cloudinary
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `temp-${uniqueSuffix}${ext}`);
  }
});

// Filtre pour les types de fichiers
const fileFilter = (req, file, cb) => {
  // Accepter les images, documents, audio et vidéo
  const allowedMimeTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac',
    // Vidéo
    'video/mp4', 'video/webm', 'video/ogg'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non pris en charge'), false);
  }
};

// Limites de taille des fichiers
const profileLimits = {
  fileSize: 5 * 1024 * 1024 // 5 MB
};

const messageLimits = {
  fileSize: 30 * 1024 * 1024 // 30 MB
};

const roomLimits = {
  fileSize: 5 * 1024 * 1024 // 5 MB
};

// Créer les instances de multer avec le stockage temporaire
const uploadProfile = multer({
  storage: storage,
  limits: profileLimits,
  fileFilter: (req, file, cb) => {
    // Accepter uniquement les images pour les profils
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont autorisées pour les photos de profil'), false);
    }
  }
});

const uploadMessage = multer({
  storage: storage,
  limits: messageLimits,
  fileFilter
});

const uploadRoom = multer({
  storage: storage,
  limits: roomLimits,
  fileFilter: (req, file, cb) => {
    // Accepter uniquement les images pour les avatars de salle
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont autorisées pour les avatars de salle'), false);
    }
  }
});

// Fonction pour nettoyer les fichiers temporaires
const cleanupTempFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

// Middleware de gestion des erreurs de téléchargement
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Erreur Multer
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Le fichier est trop volumineux'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Erreur de téléchargement: ${err.message}`
    });
  } else if (err) {
    // Autre erreur
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

module.exports = {
  uploadProfile: uploadProfile.single('profilePicture'),
  uploadMessage: uploadMessage.single('media'),
  uploadRoom: uploadRoom.single('avatar'),
  handleUploadError,
  cleanupTempFile
};
