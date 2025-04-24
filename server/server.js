// === IMPORTS ===
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import { Mistral } from '@mistralai/mistralai';
import removeMd from 'remove-markdown'; // Pour nettoyer le Markdown

// === CONFIGURATION & SETUP ===
dotenv.config(); // Charger .env dès que possible

// Vérifier et charger les variables d'environnement
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!ELEVENLABS_API_KEY) {
  console.error('Erreur: Clé API ElevenLabs (ELEVENLABS_API_KEY) manquante dans le fichier .env');
  process.exit(1);
}
if (!ELEVENLABS_VOICE_ID) {
  console.error('Erreur: ID de Voix ElevenLabs (ELEVENLABS_VOICE_ID) manquant dans le fichier .env');
  process.exit(1);
}
if (!MISTRAL_API_KEY) {
  console.error('Erreur: Clé API Mistral (MISTRAL_API_KEY) manquante dans le fichier .env');
  process.exit(1);
}

// Construire l'URL de l'API ElevenLabs dynamiquement
const ELEVENLABS_API_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/with-timestamps`;

// Initialiser le client Mistral
const mistralClient = new Mistral({ apiKey: MISTRAL_API_KEY });
console.log("Client Mistral initialisé.");

// Créer l'application Express
const app = express();
const PORT = process.env.PORT || 5001;

// Configuration Multer (pour upload PDF en mémoire)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true); // Accepter PDF
    } else {
      cb(new Error('Type de fichier non supporté ! Seuls les PDF sont autorisés.'), false); // Rejeter autres
    }
  },
  limits: { fileSize: 15 * 1024 * 1024 } // Limite 15MB
});

// --- MIDDLEWARES GLOBAUX ---
app.use(cors());       // Autoriser les requêtes cross-origin
app.use(express.json()); // Permettre de parser les corps de requête JSON

// --- ROUTES ---
// Route GET de base
app.get('/', (req, res) => {
  res.status(200).send('AudioDoc Visualizer Backend is running!');
});

// Route POST principale pour générer l'audio
app.post('/api/generate', upload.single('pdfFile'), async (req, res) => {
  console.log('Requête reçue sur /api/generate');

  try {
    let inputText = '';
    let plainText = ''; // Déclare plainText ici

    // --- 1. Récupération du texte via Mistral OCR --- 
    if (req.file) {
      console.log(`Fichier PDF reçu: ${req.file.originalname}, taille: ${req.file.size} bytes`);

      // Étape 1: Uploader le buffer du fichier vers l'API Mistral Files
      console.log("Étape 1/3 : Upload du fichier vers Mistral API...");

      // Préparer l'objet payload pour l'upload
      const uploadPayload = {
          file: { // La clé 'file' contient un objet décrivant le fichier
              fileName: req.file.originalname, // <--- Utilise fileName (camelCase)
              content: req.file.buffer         // Contenu binaire (Buffer est compatible Uint8Array)
          },
          purpose: 'ocr' // Objectif de l'upload
      };

      // Log pour vérifier (sans afficher le buffer entier)
      console.log("Payload pour files.upload:", {
          file: { fileName: uploadPayload.file.fileName, size: uploadPayload.file.content.length }, // Adapte le log si tu veux
          purpose: uploadPayload.purpose
      });

      // Appel de l'upload avec le payload structuré correctement
      const uploadedFile = await mistralClient.files.upload(uploadPayload);

      console.log(`Fichier uploadé avec succès. ID: ${uploadedFile.id}`);

      // Étape 2: Obtenir une URL signée pour le fichier uploadé
      console.log("Étape 2/3 : Obtention de l'URL signée...");
      // Note: l'API a changé, get_signed_url n'existe plus. 
      // On utilise directement l'ID avec l'API OCR.
      // ===> RE-ACTIVATION TEMPORAIRE POUR TESTER VOTRE STRUCTURE
      const signedUrlResponse = await mistralClient.files.getSignedUrl({ fileId: uploadedFile.id });
      const documentUrl = signedUrlResponse.url;
      console.log("URL signée obtenue.");

      // Étape 3: Appeler l'API OCR avec l'ID du fichier
      console.log("Étape 3/3 : Appel de l'API Mistral OCR...");
      // Correction selon votre demande
      const ocrResponse = await mistralClient.ocr.process({ 
         model: "mistral-ocr-latest", 
         document: {
             type: "document_url",
             documentUrl: documentUrl,
         }
      });
      console.log(`Réponse OCR reçue. Nombre de pages traitées: ${ocrResponse.pages?.length}`);

      // Étape 4: Extraire et combiner le texte Markdown de toutes les pages
      if (ocrResponse.pages && ocrResponse.pages.length > 0) {
         inputText = ocrResponse.pages.map(page => page.markdown).join('\n\n');
      } else {
         console.warn("Mistral OCR n'a renvoyé aucune page de contenu.");
         throw new Error('Aucun contenu textuel extrait par Mistral OCR.');
      }

      console.log(`Texte extrait par Mistral OCR (longueur): ${inputText.length}`);
      console.log(`Texte extrait par Mistral OCR (début): "${inputText.substring(0, 300)}..."`);

      // --- AJOUT : Nettoyage du Markdown en Texte Brut ---
      console.log("Nettoyage du Markdown en texte brut...");
      plainText = removeMd(inputText); // Assigne à plainText
      console.log(`Texte après nettoyage Markdown (début): "${plainText.substring(0, 300)}..."`);
      // --- Fin Ajout ---

      // Optionnel: Supprimer le fichier uploadé sur Mistral après traitement
      try {
        console.log(`Tentative de suppression du fichier uploadé ${uploadedFile.id}...`);
        await mistralClient.files.delete({ fileId: uploadedFile.id });
        console.log(`Fichier ${uploadedFile.id} supprimé.`);
      } catch (deleteError) {
        console.warn(`Impossible de supprimer le fichier ${uploadedFile.id} après OCR:`, deleteError.message);
      }

    } else if (req.body && req.body.text) {
      console.log("Texte brut reçu.");
      inputText = req.body.text; // Garde inputText si besoin de la version brute
      // inputText = inputText.replace(/\s+/g, ' ').trim(); // Nettoyage supprimé
      // console.log(`Texte brut (début): "${inputText.substring(0, 100)}..."`);
      // --- AJOUT: Si le texte vient directement du body, il n'y a pas de markdown à nettoyer --- 
      // Assignons inputText à plainText pour que la suite fonctionne.
      // const plainText = inputText; // Pas de nettoyage nécessaire ici <-- SUPPRIMER CETTE LIGNE (redéclaration)
      plainText = removeMd(inputText); // Nettoie aussi le texte brut et assigne à plainText
      // Ou si tu es sûr que le texte brut n'a jamais de Markdown: plainText = inputText.trim();
      console.log(`Texte brut nettoyé (début): "${plainText.substring(0, 100)}..."`);
    } else {
      return res.status(400).json({ error: 'Aucun fichier PDF ou texte fourni.' });
    }

    // --- 2. Validation du texte (utilise plainText maintenant) ---
    if (!plainText || !plainText.trim()) { // Vérifie plainText
       console.error('Le texte après nettoyage Markdown est vide.');
       return res.status(400).json({ error: 'Le texte résultant après nettoyage est vide.' });
    }

    // Log de la taille du texte nettoyé envoyé
    console.log(`Total plainText length being sent: ${plainText.length}`);

    // --- 3. Appel à l'API ElevenLabs (utilise plainText maintenant) ---
    console.log(`Appel de l'API ElevenLabs pour la voix ${ELEVENLABS_VOICE_ID}...`);
    const headers = {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    };
    const requestBody = {
      text: plainText, // <<<=== UTILISE plainText ICI !!!
      model_id: 'eleven_flash_v2_5', // <<<=== MODÈLE MIS À JOUR ICI
      voice_settings: {
        stability: 0.5, // Ajuste ces valeurs si tu veux expérimenter
        similarity_boost: 0.75,
      }
    };

    // --- Logging Détaillé Avant Appel API ---
    console.log('--- DEBUG: Calling ElevenLabs ---');
    console.log('Using API Key (start):', ELEVENLABS_API_KEY ? ELEVENLABS_API_KEY.substring(0, 5) + '...' : 'KEY NOT FOUND!');
    console.log('Using Voice ID:', ELEVENLABS_VOICE_ID);
    console.log('Using Model ID:', requestBody.model_id); // Log du modèle utilisé
    console.log('Sending Text (first 300 chars):', plainText ? plainText.substring(0, 300) : 'EMPTY!'); // Utilise plainText
    console.log('Sending Headers:', JSON.stringify(headers, null, 2));
    console.log('---------------------------------');
    // --- Fin du Logging Détaillé ---

    // Envoi de la requête POST à ElevenLabs avec Axios
    const response = await axios.post(ELEVENLABS_API_URL, requestBody, {
      headers: headers
    });

    // --- 4. Envoi de la Réponse JSON (avec audio et alignement) au Client ---
    if (response.status === 200 && response.data && response.data.audio_base64 && response.data.alignment) {
      console.log('Audio et alignement générés avec succès par ElevenLabs.');
      // Renvoie directement l'objet JSON reçu d'ElevenLabs au frontend
      // Il contient 'audio_base64' et 'alignment' (et potentiellement 'normalized_alignment')
      res.status(200).json(response.data);
    } else {
      // Si la réponse, bien que 200, n'a pas le format attendu
      console.error('Réponse 200 inattendue ou incomplète de l\'API ElevenLabs:', response.data);
      throw new Error('Erreur lors de la récupération des données audio/alignement depuis l\'API externe.');
    }

  } catch (error) {
    // --- 5. Gestion des Erreurs ---
    console.error('Erreur détaillée dans /api/generate:', error);

    // Gestion spécifique des erreurs potentielles de l'API Mistral
    // Vérifier si c'est une erreur formatée par le client Mistral ou une erreur API standard
    let isMistralError = false;
    let mistralStatus = 500;
    let mistralMessage = 'Erreur API Mistral inconnue.';
    if (error.name === 'MistralAPIError' || error.constructor?.name === 'MistralAPIError') {
      isMistralError = true;
      mistralStatus = error.status || 500;
      mistralMessage = error.message || mistralMessage;
    } else if (error.response?.data?.object === 'error' && error.response?.data?.message) { // Format API standard
      isMistralError = true;
      mistralStatus = error.response.status || 500;
      mistralMessage = error.response.data.message;
    }
    
    if (isMistralError) {
        console.error(`Erreur spécifique de l'API Mistral (${mistralStatus}):`, mistralMessage);
        return res.status(mistralStatus).json({ error: `Erreur API Mistral: ${mistralMessage}` });
    }

    // Gestion des erreurs Axios (ElevenLabs)
    if (error.response) { 
        const status = error.response.status || 500;
        const detail = error.response.data?.detail;
        let message = error.response.statusText || 'Erreur API externe (ElevenLabs)';

        if (status === 422) {
            message = "Erreur de validation des données envoyées à l'API TTS.";
            if (Array.isArray(detail)) { message += ` Détail: ${detail[0]?.loc?.join('->')}: ${detail[0]?.msg}`; }
            else if (typeof detail === 'string') { message += ` Détail: ${detail}`; }
        } else if (typeof detail === 'string') { 
            message = detail; 
        } else if (Array.isArray(detail) && detail[0]?.msg) { 
            message = detail[0].msg; 
        } else if (typeof detail === 'object' && detail !== null && detail.message) { 
            message = detail.message; 
        } else if (error.response.data instanceof ArrayBuffer || error.response.data instanceof Buffer) { 
            message = `Erreur ${status} reçue de l'API (corps binaire)`; 
        }
        console.error(`Erreur API externe (ElevenLabs) ${status}: ${message}`);
        return res.status(status).json({ error: `Erreur API Externe (ElevenLabs): ${message}` });

    // Gestion des erreurs Multer
    } else if (error instanceof multer.MulterError || error.message.includes('Type de fichier non supporté')) {
       return res.status(400).json({ error: `Erreur d'upload: ${error.message}` });
    
    // Erreur lancée explicitement (ex: OCR n'a rien retourné)
    } else if (error.message === 'Aucun contenu textuel extrait par Mistral OCR.') {
        return res.status(500).json({ error: error.message });
    } 

    // Autre erreur interne non identifiée
    return res.status(500).json({ error: error.message || 'Une erreur interne inconnue est survenue sur le serveur.' });
  }
});

// --- DÉMARRAGE DU SERVEUR ---
app.listen(PORT, () => {
  console.log(`Serveur backend démarré et à l'écoute sur http://localhost:${PORT}`);
});