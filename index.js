const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

// Import des routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const chatRoomRoutes = require("./routes/chatRoomRoutes");
const mediaRoutes = require("./routes/mediaRoutes");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://chat-app-henna-nine-33.vercel.app", // URL du frontend
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(
  cors({
    origin: "https://chat-app-henna-nine-33.vercel.app", // URL du frontend
    credentials: true, // Autoriser les cookies
  })
);
app.use(express.json());
app.use(cookieParser());

// Servir les fichiers statiques
app.use("/uploads", express.static("uploads"));

// Créer les dossiers d'uploads s'ils n'existent pas
const fs = require("fs");
const path = require("path");
const uploadDirs = [
  "uploads",
  "uploads/profiles",
  "uploads/messages",
  "uploads/rooms",
];
uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Dossier ${dir} créé`);
  }
});

// Configuration de la session
app.use(
  session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 jour
    },
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chatrooms", chatRoomRoutes);
app.use("/api/media", mediaRoutes);

// Route de base
app.get("/", (req, res) => {
  res.send("Backend API is running");
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error("Erreur interceptée:", err.stack);
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production" ? "Erreur serveur" : err.message,
  });
});

// Middleware pour les routes non trouvées
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route non trouvée",
  });
});

const socketUtils = require('./utils/socket');

// Set Socket.IO instance
socketUtils.setIo(io);

// Socket.IO setup for real-time messaging
const onlineUsers = socketUtils.getOnlineUsers();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle user joining
  socket.on("join", (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit("onlineUsers", Array.from(onlineUsers.keys()));
    console.log("User joined:", userId);
  });

  // Handle private message
  socket.on("privateMessage", (data) => {
    const { senderId, receiverId, content, messageId, media, timestamp } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    const messageTimestamp = timestamp || new Date().toISOString();
    console.log(`Private message from ${senderId} to ${receiverId}: ${content}`);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("privateMessage", {
        senderId,
        content,
        messageId,
        media,
        timestamp: messageTimestamp
      });
      console.log(`Message sent to ${receiverId} at socket ${receiverSocketId}`);
    } else {
      console.log(`Receiver ${receiverId} not found or not online`);
    }
    // Also send back to sender for confirmation
    io.to(socket.id).emit("privateMessageSent", {
      receiverId,
      content,
      messageId,
      media,
      timestamp: messageTimestamp
    });
  });

  // Handle typing indicator
  socket.on("typing", (data) => {
    const { senderId, receiverId, isTyping } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    console.log(`Typing event from ${senderId} to ${receiverId}: ${isTyping}`);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderId, isTyping });
      console.log(`Typing event sent to ${receiverId} at socket ${receiverSocketId}`);
    } else {
      console.log(`Receiver ${receiverId} not found or not online for typing event`);
    }
  });

  // Handle WebRTC signaling for audio and video calls
  socket.on("call:initiate", (data) => {
    const { callerId, receiverId, callType } = data; // callType: 'audio' or 'video'
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("call:incoming", {
        callerId,
        callType,
        timestamp: new Date().toISOString()
      });
      console.log(`Call initiated from ${callerId} to ${receiverId} (${callType})`);
    } else {
      io.to(socket.id).emit("call:unavailable", {
        receiverId,
        message: "User is not online"
      });
    }
  });

  socket.on("call:accept", (data) => {
    const { callerId, receiverId, callType } = data;
    const callerSocketId = onlineUsers.get(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("call:accepted", {
        receiverId,
        callType,
        timestamp: new Date().toISOString()
      });
      console.log(`Call accepted by ${receiverId} from ${callerId} (${callType})`);
    }
  });

  socket.on("call:reject", (data) => {
    const { callerId, receiverId } = data;
    const callerSocketId = onlineUsers.get(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("call:rejected", {
        receiverId,
        timestamp: new Date().toISOString()
      });
      console.log(`Call rejected by ${receiverId} from ${callerId}`);
    }
  });

  socket.on("call:end", (data) => {
    const { userId, peerId } = data;
    const peerSocketId = onlineUsers.get(peerId);
    if (peerSocketId) {
      io.to(peerSocketId).emit("call:ended", {
        userId,
        timestamp: new Date().toISOString()
      });
      console.log(`Call ended by ${userId} with ${peerId}`);
    }
  });

  socket.on("call:toggle", (data) => {
    const { userId, peerId, callType } = data; // callType: 'audio' or 'video'
    const peerSocketId = onlineUsers.get(peerId);
    if (peerSocketId) {
      io.to(peerSocketId).emit("call:toggled", {
        userId,
        callType,
        timestamp: new Date().toISOString()
      });
      console.log(`Call toggled by ${userId} to ${callType} with ${peerId}`);
    }
  });

  socket.on("webrtc:offer", (data) => {
    const { senderId, receiverId, offer } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("webrtc:offer", {
        senderId,
        offer,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on("webrtc:answer", (data) => {
    const { senderId, receiverId, answer } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("webrtc:answer", {
        senderId,
        answer,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on("webrtc:ice-candidate", (data) => {
    const { senderId, receiverId, candidate } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("webrtc:ice-candidate", {
        senderId,
        candidate,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle user logout
  socket.on("logout", (userId) => {
    onlineUsers.delete(userId);
    io.emit("onlineUsers", Array.from(onlineUsers.keys()));
    console.log("User logged out:", userId);
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        io.emit("onlineUsers", Array.from(onlineUsers.keys()));
        console.log("User disconnected:", userId);
        break;
      }
    }
  });
});

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("✅ Connecté à MongoDB avec succès");

    // Démarrage du serveur
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`🌍 Environnement: ${process.env.NODE_ENV || "production"}`);
      console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`☁️  Cloudinary Cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);

      // Vérification des variables d'environnement critiques
      if (!process.env.JWT_SECRET) {
        console.warn("⚠️ Avertissement: JWT_SECRET non défini");
      }
      if (!process.env.MONGODB_URI) {
        console.warn("⚠️ Avertissement: MONGODB_URI non défini");
      }
    });
  })
  .catch((err) => {
    console.error("❌ Échec de la connexion à MongoDB:", err.message);
    process.exit(1);
  });

// Gestion des arrêts propres
process.on("SIGINT", () => {
  mongoose.connection.close(() => {
    console.log("⏏️ Déconnexion de MongoDB due à l'arrêt de l'application");
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});
