const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de la salle de chat est requis'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['public', 'private', 'direct'],
    default: 'public'
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  avatar: {
    type: String,
    default: '/placeholder.svg'
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Méthode pour ajouter un membre à la salle de chat
chatRoomSchema.methods.addMember = async function(userId) {
  if (!this.members.includes(userId)) {
    this.members.push(userId);
    this.lastActivity = Date.now();
    await this.save();
  }
  return this;
};

// Méthode pour supprimer un membre de la salle de chat
chatRoomSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(member => member.toString() !== userId.toString());
  this.admins = this.admins.filter(admin => admin.toString() !== userId.toString());
  this.lastActivity = Date.now();
  await this.save();
  return this;
};

// Méthode pour promouvoir un membre en administrateur
chatRoomSchema.methods.promoteToAdmin = async function(userId) {
  if (this.members.includes(userId) && !this.admins.includes(userId)) {
    this.admins.push(userId);
    this.lastActivity = Date.now();
    await this.save();
  }
  return this;
};

// Méthode pour rétrograder un administrateur
chatRoomSchema.methods.demoteFromAdmin = async function(userId) {
  // Ne pas rétrograder le créateur
  if (this.creator.toString() === userId.toString()) {
    return this;
  }
  
  this.admins = this.admins.filter(admin => admin.toString() !== userId.toString());
  this.lastActivity = Date.now();
  await this.save();
  return this;
};

// Méthode pour mettre à jour le dernier message
chatRoomSchema.methods.updateLastMessage = async function(messageId) {
  this.lastMessage = messageId;
  this.lastActivity = Date.now();
  await this.save();
  return this;
};

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);

module.exports = ChatRoom;
