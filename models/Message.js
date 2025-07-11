const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  chatRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom'
  },
  content: {
    type: String,
    required: [true, 'Le contenu du message est requis']
  },
  mediaUrl: {
    type: String
  },
  mediaType: {
    type: String,
    enum: ['image', 'audio', 'video', 'document', null],
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  isPlayed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  favoritedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { timestamps: true });

// Méthode pour marquer/démarquer un message comme favori
messageSchema.methods.toggleFavorite = async function(userId) {
  const userIndex = this.favoritedBy.indexOf(userId);
  
  if (userIndex === -1) {
    this.favoritedBy.push(userId);
    this.isFavorite = true;
  } else {
    this.favoritedBy.splice(userIndex, 1);
    this.isFavorite = this.favoritedBy.length > 0;
  }
  
  await this.save();
  return this;
};

// Méthode pour marquer un message comme lu par un utilisateur
messageSchema.methods.markAsRead = async function(userId) {
  // Vérifier si l'utilisateur a déjà lu le message
  const alreadyRead = this.readBy.some(read => read.user.toString() === userId.toString());
  
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: Date.now()
    });
    
    // Mettre à jour isRead si tous les destinataires ont lu le message
    if (this.chatRoom) {
      // Pour les messages de groupe, on vérifie si tous les membres ont lu
      const chatRoom = await mongoose.model('ChatRoom').findById(this.chatRoom);
      if (chatRoom && chatRoom.members.length === this.readBy.length) {
        this.isRead = true;
      }
    } else if (this.receiver && this.receiver.toString() === userId.toString()) {
      // Pour les messages privés, on marque comme lu si le destinataire a lu
      this.isRead = true;
    }
    
    await this.save();
  }
  
  return this;
};

// Méthode pour ajouter une réaction à un message
messageSchema.methods.addReaction = async function(userId, emoji) {
  // Vérifier si l'utilisateur a déjà réagi avec cet emoji
  const existingReaction = this.reactions.findIndex(
    reaction => reaction.user.toString() === userId.toString() && reaction.emoji === emoji
  );
  
  if (existingReaction !== -1) {
    // Supprimer la réaction existante
    this.reactions.splice(existingReaction, 1);
  } else {
    // Ajouter la nouvelle réaction
    this.reactions.push({
      user: userId,
      emoji,
      createdAt: Date.now()
    });
  }
  
  await this.save();
  return this;
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
