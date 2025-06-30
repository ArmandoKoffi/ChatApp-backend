const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware pour vérifier le token JWT
exports.protect = async (req, res, next) => {
  let token;

  // Vérifier si le token est présent dans les headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    // Vérifier si le token est présent dans les cookies
    token = req.cookies.token;
  }

  // Vérifier si le token existe
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Vous n\'êtes pas autorisé à accéder à cette ressource'
    });
  }

  try {
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ajouter l'utilisateur à la requête
    req.user = await User.findById(decoded.id).select('-password');
    
    // Mettre à jour lastActive
    await User.findByIdAndUpdate(decoded.id, { lastActive: Date.now() }, { new: true });
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré'
    });
  }
};

// Middleware pour vérifier les rôles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas les droits nécessaires pour accéder à cette ressource'
      });
    }
    next();
  };
};