// Notifier l'utilisateur bloqué
exports.notifyUserBlocked = (blockedBy, blockedUser) => {
  const io = exports.getIo();
  const blockedSocket = exports.getOnlineUsers().get(blockedUser)?.socketId;
  if (blockedSocket) {
    io.to(blockedSocket).emit("userBlocked", { blockedBy });
  }
};

// Notifier l'utilisateur débloqué
exports.notifyUserUnblocked = (unblockedBy, unblockedUser) => {
  const io = exports.getIo();
  const unblockedSocket = exports.getOnlineUsers().get(unblockedUser)?.socketId;
  if (unblockedSocket) {
    io.to(unblockedSocket).emit("userUnblocked", { unblockedBy });
  }
};
// Singleton pour gérer l'instance Socket.IO
let io;

exports.setIo = (socketIoInstance) => {
  io = socketIoInstance;
};

exports.getIo = () => {
  if (!io) {
    throw new Error("Socket.IO instance not initialized");
  }
  return io;
};

// Map pour stocker les utilisateurs en ligne avec leurs informations
const onlineUsers = new Map();

// Map pour stocker les utilisateurs bloqués
const blockedUsers = new Map();

exports.getOnlineUsers = () => onlineUsers;

// Fonction pour ajouter un utilisateur en ligne
exports.addOnlineUser = (userId, socketId, userInfo = {}) => {
  onlineUsers.set(userId, {
    socketId,
    ...userInfo,
    lastSeen: new Date(),
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
      lastSeen: new Date(),
    });
  }
};

// Fonction pour obtenir les IDs des utilisateurs en ligne
exports.getOnlineUserIds = () => {
  return Array.from(onlineUsers.keys());
};

// Fonction pour notifier un utilisateur qu'il a été bloqué
exports.notifyUserBlocked = (blockedBy, blockedUser) => {
  const blockedUserSocket = onlineUsers.get(blockedUser);
  if (blockedUserSocket && blockedUserSocket.socketId) {
    io.to(blockedUserSocket.socketId).emit("userBlocked", { blockedBy });
  }
};

// Fonction pour notifier un utilisateur qu'il a été débloqué
exports.notifyUserUnblocked = (unblockedBy, unblockedUser) => {
  const unblockedUserSocket = onlineUsers.get(unblockedUser);
  if (unblockedUserSocket && unblockedUserSocket.socketId) {
    io.to(unblockedUserSocket.socketId).emit("userUnblocked", { unblockedBy });
  }
};

// Fonction pour vérifier si un utilisateur est bloqué par un autre
exports.isUserBlockedBy = async (userId, blockedById) => {
  const User = require("../models/User");
  const user = await User.findById(blockedById);
  return user && user.blockedUsers.includes(userId);
};

// Fonction pour filtrer les utilisateurs en ligne en excluant les utilisateurs bloqués
exports.getFilteredOnlineUsers = async (userId) => {
  const User = require("../models/User");
  const user = await User.findById(userId).select("blockedUsers");

  if (!user) return [];

  const blockedUserIds = user.blockedUsers.map((id) => id.toString());
  const allOnlineUserIds = exports.getOnlineUserIds();

  // Filtrer les utilisateurs qui ont bloqué l'utilisateur actuel
  const usersWhoBlockedCurrent = [];
  for (const onlineUserId of allOnlineUserIds) {
    if (onlineUserId !== userId.toString()) {
      const otherUser = await User.findById(onlineUserId).select(
        "blockedUsers"
      );
      if (otherUser && otherUser.blockedUsers.includes(userId)) {
        usersWhoBlockedCurrent.push(onlineUserId);
      }
    }
  }

  // Retourner les utilisateurs en ligne qui ne sont pas bloqués et qui n'ont pas bloqué l'utilisateur actuel
  return allOnlineUserIds.filter(
    (id) =>
      id !== userId.toString() &&
      !blockedUserIds.includes(id) &&
      !usersWhoBlockedCurrent.includes(id)
  );
};
