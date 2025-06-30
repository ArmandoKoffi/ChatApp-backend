const nodemailer = require('nodemailer');
const generatePassword = require('generate-password');

/**
 * Crée un transporteur pour l'envoi d'emails
 * @returns {Object} - Le transporteur configuré 
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

/**
 * Génère un mot de passe aléatoire sécurisé
 * @returns {string} - Le mot de passe généré
 */
const generateSecurePassword = () => {
  return generatePassword.generate({
    length: 12,
    numbers: true,
    symbols: true,
    uppercase: true,
    excludeSimilarCharacters: true
  });
};

/**
 * Envoie un email de réinitialisation de mot de passe
 * @param {Object} options - Les options d'envoi
 * @param {string} options.email - L'adresse email du destinataire
 * @param {string} options.username - Le nom d'utilisateur du destinataire
 * @param {string} options.password - Le nouveau mot de passe généré
 * @returns {Promise} - Une promesse résolue lorsque l'email est envoyé
 */
const sendPasswordResetEmail = async (options) => {
  const transporter = createTransporter();
  
  const message = {
    from: `${process.env.EMAIL_FROM}`,
    to: options.email,
    subject: 'Réinitialisation de votre mot de passe',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">Réinitialisation de votre mot de passe</h2>
        <p>Bonjour ${options.username},</p>
        <p>Vous avez demandé une réinitialisation de votre mot de passe.</p>
        <p>Voici votre nouveau mot de passe temporaire :</p>
        <div style="background-color: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; margin: 15px 0;">
          <strong>${options.password}</strong>
        </div>
        <p>Veuillez vous connecter avec ce mot de passe, puis le changer immédiatement pour des raisons de sécurité.</p>
        <p>Si vous n'avez pas demandé cette réinitialisation, veuillez contacter notre support immédiatement.</p>
        <p>Cordialement,<br>L'équipe de support</p>
      </div>
    `
  };

  await transporter.sendMail(message);
};

module.exports = {
  sendPasswordResetEmail,
  generateSecurePassword
};
