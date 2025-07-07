// Singleton pour gérer l'instance Socket.IO
let io;

exports.setIo = (socketIoInstance) => {
  io = socketIoInstance;
};

exports.getIo = () => {
  if (!io) {
    throw new Error('Socket.IO instance not initialized');
  }
  return io;
};

// Map pour stocker les utilisateurs en ligne avec leurs informations
const onlineUsers = new Map();

exports.getOnlineUsers = () => onlineUsers;

// Fonction pour ajouter un utilisateur en ligne
exports.addOnlineUser = (userId, socketId, userInfo = {}) => {
  onlineUsers.set(userId, {
    socketId,
    ...userInfo,
    lastSeen: new Date()
  });
};

// Fonction pour supprimer un utilisateur en ligne
exports.removeOnlineUser = (userId) => {
  onlineUsers.delete(userId);
};

// Fonction pour mettre à jour les informations d'un utilisateur en ligne
exports.updateOnlineUser = (userId, userInfo) => {
  const existingUser = onlineUsers.get(userId);
  if (existingUser) {
    onlineUsers.set(userId, {
      ...existingUser,
      ...userInfo,
      lastSeen: new Date()
    });
  }
};

// Fonction pour obtenir les IDs des utilisateurs en ligne
exports.getOnlineUserIds = () => {
  return Array.from(onlineUsers.keys());
};
