// Importer les modules nécessaires (syntaxe ES Module)
import axios from 'axios';
import { PdfReader } from 'pdfreader';
import multer from 'multer';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis le fichier .env (s'il existe)
dotenv.config();
const configOutput = dotenv.config(); // Récupère le résultat de config()

// Charger et vérifier la clé API ElevenLabs depuis .env
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error('Erreur: Clé API ElevenLabs (ELEVENLABS_API_KEY) manquante dans le fichier .env');
  process.exit(1); // Arrête le serveur si la clé est manquante
}

// Charger et vérifier l'ID de la voix depuis .env
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
if (!ELEVENLABS_VOICE_ID) {
  console.error('Erreur: ID de Voix ElevenLabs (ELEVENLABS_VOICE_ID) manquant dans le fichier .env');
  process.exit(1); // Arrête le serveur si l'ID est manquant
}

// Créer l'application Express
const app = express();

// Définir le port d'écoute
const PORT = process.env.PORT || 5001;

// === Middlewares ===
app.use(cors()); // Activer CORS
app.use(express.json()); // Activer le parsing JSON

// Configuration Multer pour stocker le fichier PDF en mémoire tampon (buffer)
const storage = multer.memoryStorage(); // Stocke dans req.file.buffer

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Vérifier le type MIME du fichier
    if (file.mimetype === 'application/pdf') {
      cb(null, true); // Accepter le fichier
    } else {
      // Rejeter le fichier avec une erreur
      cb(new Error('Type de fichier non supporté ! Seuls les PDF sont autorisés.'), false);
    }
  },
  limits: {
    fileSize: 15 * 1024 * 1024 // Limiter la taille du fichier (ex: 15 Mo)
  }
});

// === Routes ===
// Route de test
app.get('/', (req, res) => {
  res.status(200).send('AudioDoc Visualizer Backend is running!');
});

// Fonction helper pour extraire le texte d'un buffer PDF avec pdfreader
function extractTextFromPdfBuffer(buffer) {
  return new Promise((resolve, reject) => {
    let pdfText = '';
    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) {
        // Si pdfreader renvoie une erreur pendant le parsing
        console.error("Erreur de parsing PDF avec pdfreader:", err);
        reject(err); // Rejette la Promesse
      } else if (!item) {
        // Si item est null, c'est la fin du parsing
        // console.log("Fin du parsing PDF (pdfreader)"); // Log optionnel
        resolve(pdfText.trim()); // Résout la Promesse avec le texte accumulé (et nettoyé)
      } else if (item.text) {
        // Si item est un élément texte, on l'ajoute
        pdfText += item.text + " "; // Ajoute un espace pour séparer les mots/items
      }
    });
  });
}

// Route pour gérer la génération audio (POST /api/generate)
// upload.single('pdfFile') : Middleware multer pour gérer UN fichier uploadé dans le champ 'pdfFile'
app.post('/api/generate', upload.single('pdfFile'), async (req, res) => {
  console.log('Requête reçue sur /api/generate'); // Pour le débogage

  try {
    let inputText = ''; // Variable pour stocker le texte à traiter

    // Logique pour récupérer le texte :
    // Cas 1 : Un fichier PDF a été uploadé
    if (req.file) {
      console.log(`Fichier PDF reçu: ${req.file.originalname}, taille: ${req.file.size} bytes`);
      // Le contenu du fichier est dans req.file.buffer
      // Extraire le texte du buffer PDF en utilisant pdf-parse
      console.log('Parsing PDF buffer with pdfreader...');
      // Appelle notre fonction helper qui retourne une Promesse
      inputText = await extractTextFromPdfBuffer(req.file.buffer);
      console.log(`PDF Parsed with pdfreader! Text length: ${inputText.length}`);
    }
    // Cas 2 : Du texte brut a été envoyé dans le corps de la requête
    else if (req.body && req.body.text) {
      console.log("Texte brut reçu.");
      inputText = req.body.text;
    }
    // Cas 3 : Ni fichier, ni texte n'ont été fournis
    else {
      console.error('Aucune donnée reçue (ni fichier PDF, ni texte).');
      // On lève une erreur pour aller directement au bloc catch
      // Le code 400 indique une mauvaise requête du client
      return res.status(400).json({ error: 'Aucun fichier PDF ou texte fourni.' });
    }

    // Vérification simple que le texte n'est pas vide après récupération
    if (!inputText || !inputText.trim()) {
       console.error('Le texte extrait ou fourni est vide.');
       return res.status(400).json({ error: 'Le texte résultant est vide.' });
    }

    // À ce stade, 'inputText' contient le texte à envoyer à ElevenLabs
    console.log(`Texte préparé (début): "${inputText.substring(0, 100)}..."`);

    // TODO: Appeler l'API ElevenLabs avec inputText
    // TODO: Récupérer la réponse audio (buffer)
    // TODO: Renvoyer la réponse audio au client

    // Réponse temporaire (placeholder) pour indiquer que la logique est en cours
    res.status(200).json({
      message: 'Données reçues, traitement ElevenLabs à implémenter.',
      preview: inputText.substring(0, 200) + '...' // Renvoie un aperçu du texte reçu
    });

  } catch (error) {
    // Gestion globale des erreurs pour cette route
    console.error('Erreur dans /api/generate:', error.message);

    // Si l'erreur vient de multer (ex: mauvais type de fichier, fichier trop gros)
    if (error instanceof multer.MulterError) {
        return res.status(400).json({ error: `Erreur d'upload: ${error.message}` });
    } else if (error.message.includes('Type de fichier non supporté')) {
         return res.status(400).json({ error: error.message });
    }

    // Pour les autres erreurs (parsing PDF, ElevenLabs, etc.)
    // Le code 500 indique une erreur côté serveur
    res.status(500).json({ error: error.message || 'Une erreur interne est survenue.' });
  }
});

// === Démarrage du serveur ===
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
