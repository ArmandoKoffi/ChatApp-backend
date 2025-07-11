const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Clé de chiffrement pour les URLs
const ENCRYPTION_KEY = process.env.JWT_SECRET.substring(0, 32); // Utiliser les 32 premiers caractères du JWT_SECRET
const IV_LENGTH = 16; // Pour AES, c'est toujours 16

/**
 * Chiffre une URL
 * @param {string} url - L'URL à chiffrer
 * @returns {string} - L'URL chiffrée en format base64
 */
const encryptUrl = (url) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(url);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * Déchiffre une URL chiffrée
 * @param {string} encryptedUrl - L'URL chiffrée
 * @returns {string} - L'URL déchiffrée
 */
const decryptUrl = (encryptedUrl) => {
  try {
    const textParts = encryptedUrl.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Erreur lors du déchiffrement de l\'URL:', error);
    return null;
  }
};

/**
 * Télécharge un fichier sur Cloudinary
 * @param {string} filePath - Le chemin du fichier à télécharger
 * @param {string} folder - Le dossier de destination sur Cloudinary
 * @param {boolean} secure - Si true, l'URL sera chiffrée
 * @returns {Object} - Les informations du fichier téléchargé
 */
const uploadToCloudinary = async (file, folder = 'profiles', secure = false) => {
  try {
    // Créer un stream à partir du buffer en mémoire
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      // Écrire le buffer dans le stream
      stream.end(file.buffer);
    });

    // Si sécurisé, chiffrer l'URL
    const url = secure ? encryptUrl(result.secure_url) : result.secure_url;

    return {
      url,
      public_id: result.public_id,
      secure: secure,
      original_url: result.secure_url
    };
  } catch (error) {
    console.error('Erreur lors du téléchargement sur Cloudinary:', error);
    throw new Error('Erreur lors du téléchargement du fichier');
  }
};

/**
 * Supprime un fichier de Cloudinary
 * @param {string} publicId - L'ID public du fichier à supprimer
 * @returns {Object} - Le résultat de la suppression
 */
const removeFromCloudinary = async (publicId) => {
  try {
    if (!publicId) return { result: 'success', message: 'Aucun fichier à supprimer' };
    
    const result = await cloudinary.uploader.destroy(publicId);
    return { result: 'success', ...result };
  } catch (error) {
    console.error('Erreur lors de la suppression sur Cloudinary:', error);
    throw new Error('Erreur lors de la suppression du fichier');
  }
};

/**
 * Obtient l'URL déchiffrée d'un fichier
 * @param {string} url - L'URL potentiellement chiffrée
 * @param {boolean} isEncrypted - Si l'URL est chiffrée
 * @returns {string} - L'URL déchiffrée ou l'URL originale si non chiffrée
 */
const getDecryptedUrl = (url, isEncrypted) => {
  if (!url) return null;
  return isEncrypted ? decryptUrl(url) : url;
};

module.exports = {
  uploadToCloudinary,
  removeFromCloudinary,
  encryptUrl,
  decryptUrl,
  getDecryptedUrl
};