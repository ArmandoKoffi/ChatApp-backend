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

// Map pour stocker les utilisateurs en ligne
const onlineUsers = new Map();

exports.getOnlineUsers = () => onlineUsers;
