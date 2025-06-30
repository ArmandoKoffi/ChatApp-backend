const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Le nom d\'utilisateur est requis'],
    unique: true,
    trim: true,
    minlength: [3, 'Le nom d\'utilisateur doit contenir au moins 3 caractères']
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Veuillez fournir un email valide']
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: 'other'
  },
  profilePicture: {
    type: String,
    default: 'default-other.png'
  },
  profilePictureId: {
    type: String,
    default: ''
  },
  profilePictureSecure: {
    type: Boolean,
    default: false
  },
  bio: {
    type: String,
    default: ''
  },
  interests: [{
    label: {
      type: String,
      required: true
    }
  }],
  age: {
    type: Number,
    min: [18, 'Vous devez avoir au moins 18 ans'],
    max: [100, 'Âge non valide']
  },
  intentions: {
    type: String,
    enum: ['amis', 'rencontres', 'connaissances', 'mariage', '']
  },
  location: {
    type: String,
    default: ''
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  contacts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpire: {
    type: Date
  }
}, { timestamps: true });

// Méthode pour hacher le mot de passe avant de sauvegarder
userSchema.pre('save', async function(next) {
  // Seulement hacher le mot de passe s'il a été modifié (ou est nouveau)
  if (!this.isModified('password')) return next();
  
  try {
    // Générer un sel
    const salt = await bcrypt.genSalt(10);
    // Hacher le mot de passe avec le sel
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer les mots de passe
userSchema.methods.matchPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Alias pour la compatibilité
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await this.matchPassword(candidatePassword);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
