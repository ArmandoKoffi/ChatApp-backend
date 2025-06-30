const { body, validationResult } = require('express-validator');

// Middleware pour valider les résultats
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Règles de validation pour l'inscription
exports.registerRules = [
  body('username')
    .trim()
    .notEmpty().withMessage('Le nom d\'utilisateur est requis')
    .isLength({ min: 3 }).withMessage('Le nom d\'utilisateur doit contenir au moins 3 caractères'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Veuillez fournir un email valide'),
  
  body('password')
    .trim()
    .notEmpty().withMessage('Le mot de passe est requis')
    .isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  
  body('confirmPassword')
    .trim()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other']).withMessage('Le genre doit être male, female ou other')
];

// Règles de validation pour la connexion
exports.loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Veuillez fournir un email valide'),
  
  body('password')
    .trim()
    .notEmpty().withMessage('Le mot de passe est requis')
];

// Règles de validation pour la mise à jour du profil
exports.updateProfileRules = [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3 }).withMessage('Le nom d\'utilisateur doit contenir au moins 3 caractères'),
  
  body('bio')
    .optional()
    .trim(),
  
  body('interests')
    .optional()
    .isArray().withMessage('Les intérêts doivent être un tableau')
];

// Règles de validation pour le changement de mot de passe
exports.changePasswordRules = [
  body('currentPassword')
    .trim()
    .notEmpty().withMessage('Le mot de passe actuel est requis'),
  
  body('newPassword')
    .trim()
    .notEmpty().withMessage('Le nouveau mot de passe est requis')
    .isLength({ min: 6 }).withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères'),
  
  body('confirmPassword')
    .trim()
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    })
];

// Règles de validation pour la réinitialisation de mot de passe
exports.forgotPasswordRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Veuillez fournir un email valide')
];
