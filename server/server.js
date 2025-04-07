// === IMPORTS ===
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import { PdfReader } from 'pdfreader'; // Utiliser pdfreader

// === CONFIGURATION & SETUP ===
dotenv.config(); // Charger .env dès que possible

// Vérifier et charger les variables d'environnement
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

if (!ELEVENLABS_API_KEY) {
  console.error('Erreur: Clé API ElevenLabs (ELEVENLABS_API_KEY) manquante dans le fichier .env');
  process.exit(1);
}
if (!ELEVENLABS_VOICE_ID) {
  console.error('Erreur: ID de Voix ElevenLabs (ELEVENLABS_VOICE_ID) manquant dans le fichier .env');
  process.exit(1);
}

// Construire l'URL de l'API ElevenLabs dynamiquement
const ELEVENLABS_API_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/with-timestamps`;

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

// --- FONCTION HELPER PDF avec pdfreader ---
function extractTextFromPdfBuffer(buffer) {
  return new Promise((resolve, reject) => {
    let pdfText = '';
    // Traiter le buffer avec PdfReader
    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) {
        // Erreur pendant le parsing du PDF
        console.error("Erreur de parsing PDF avec pdfreader:", err);
        reject(new Error('Erreur lors de l\'analyse du PDF.')); // Rejette la promesse
      } else if (!item) {
        // Fin du fichier PDF ('item' est null)
        resolve(pdfText.trim()); // Renvoie le texte accumulé et nettoyé
      } else if (item.text) {
        // Si 'item' contient du texte, on l'ajoute
        pdfText += item.text + " "; // Ajoute un espace pour la lisibilité
      }
    });
  });
}

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

    // --- 1. Récupération du texte ---
    if (req.file) {
      console.log(`Fichier PDF reçu: ${req.file.originalname}, taille: ${req.file.size} bytes`);
      console.log('Parsing PDF buffer with pdfreader...');
      inputText = await extractTextFromPdfBuffer(req.file.buffer); // Utilise la fonction helper
      console.log(`PDF Parsé avec pdfreader! Longueur texte: ${inputText.length}`);
      // Nettoyage optionnel des espaces multiples (bonne pratique)
      inputText = inputText.replace(/\s+/g, ' ').trim();
      console.log(`Texte nettoyé (début): "${inputText.substring(0, 100)}..."`);
    } else if (req.body && req.body.text) {
      console.log("Texte brut reçu.");
      inputText = req.body.text;
    } else {
      return res.status(400).json({ error: 'Aucun fichier PDF ou texte fourni.' });
    }

    // --- 2. Validation du texte ---
    if (!inputText || !inputText.trim()) { // Re-vérifie après nettoyage potentiel
       console.error('Le texte extrait ou fourni est vide.');
       return res.status(400).json({ error: 'Le texte résultant est vide.' });
    }

    // --- 3. Appel à l'API ElevenLabs ---
    console.log(`Appel de l'API ElevenLabs pour la voix ${ELEVENLABS_VOICE_ID}...`);
    const headers = {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    };
    const requestBody = {
      text: inputText,
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
    console.log('Sending Text (first 300 chars):', inputText ? inputText.substring(0, 300) : 'EMPTY!');
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

    if (error.response) { // Erreur venant de la réponse d'Axios (donc de l'API ElevenLabs)
        const status = error.response.status || 500;
        const detail = error.response.data?.detail; // Structure d'erreur courante chez ElevenLabs/FastAPI
        let message = error.response.statusText || 'Erreur API externe';

        // Essayer de parser les formats d'erreur d'ElevenLabs
        if (status === 422) { // Erreur de validation spécifique (Unprocessable Entity)
            message = "Erreur de validation des données envoyées à l'API TTS.";
            if (Array.isArray(detail)) { message += ` Détail: ${detail[0]?.loc?.join('->')}: ${detail[0]?.msg}`; }
            else if (typeof detail === 'string') { message += ` Détail: ${detail}`; }
            // ... autres parsings d'erreur ...
        } else if (typeof detail === 'string') { message = detail; }
          else if (Array.isArray(detail) && detail[0]?.msg) { message = detail[0].msg; }
          else if (typeof detail === 'object' && detail !== null && detail.message) { message = detail.message; }
          // Si la réponse est un buffer (ça peut arriver pour certaines erreurs API), on ne peut pas lire le message facilement ici
          else if (error.response.data instanceof ArrayBuffer || error.response.data instanceof Buffer) { message = `Erreur ${status} reçue de l'API (corps binaire)`; }

        console.error(`Erreur API externe ${status}: ${message}`);
        return res.status(status).json({ error: `Erreur API Externe: ${message}` });

    } else if (error instanceof multer.MulterError || error.message.includes('Type de fichier non supporté')) {
       // Erreur Multer (upload)
       return res.status(400).json({ error: `Erreur d'upload: ${error.message}` });
    } else if (error.message.includes('Erreur lors de l\'analyse du PDF')) {
       // Erreur venant de notre helper pdfreader
       return res.status(500).json({ error: error.message });
    }

    // Autre erreur interne non identifiée
    return res.status(500).json({ error: error.message || 'Une erreur interne est survenue sur le serveur.' });
  }
});

// --- DÉMARRAGE DU SERVEUR ---
app.listen(PORT, () => {
  console.log(`Serveur backend démarré et à l'écoute sur http://localhost:${PORT}`);
});