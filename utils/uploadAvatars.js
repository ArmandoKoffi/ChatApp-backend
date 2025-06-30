const cloudinary = require("cloudinary").v2;
const path = require("path");
require("dotenv").config();

// Connexion à Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Fonction d'upload
async function uploadAvatar(localPath, publicId) {
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      folder: "default-avatars",
      public_id: publicId,
      overwrite: true,
    });
    console.log(`${publicId} uploaded:`, result.secure_url);
  } catch (err) {
    console.error(`Erreur lors de l'upload de ${publicId}:`, err);
  }
}

// Appel des 3 avatars
async function main() {
  await uploadAvatar(
    path.join(__dirname, "..", "assets", "default-male.png"),
    "default-male"
  );
  await uploadAvatar(
    path.join(__dirname, "..", "assets", "default-female.png"),
    "default-female"
  );
  await uploadAvatar(
    path.join(__dirname, "..", "assets", "default-other.png"),
    "default-other"
  );
}

main();
