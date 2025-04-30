// === IMPORTS ===
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import { Mistral } from '@mistralai/mistralai';
import removeMd from 'remove-markdown'; // Pour nettoyer le Markdown
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid'; // <-- AJOUT: Import UUID

// === CONFIGURATION & SETUP ===
dotenv.config(); // Charger .env dès que possible

// === AJOUT: Configuration Supabase ===
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Erreur: SUPABASE_URL ou SUPABASE_SERVICE_KEY manquantes dans le fichier .env');
  process.exit(1);
}

// Initialiser le client Supabase (utiliser la SERVICE KEY ici car c'est le backend)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
console.log('Client Supabase (Backend) initialisé.');
// === FIN AJOUT Configuration Supabase ===

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

// --- AJOUT: Middleware d'Authentification Supabase ---
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Auth Middleware: Token manquant ou mal formé.');
    return res.status(401).json({ error: 'Authentification requise (Token manquant).' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('Auth Middleware: Token vide après split.');
    return res.status(401).json({ error: 'Authentification requise (Token vide).' });
  }

  try {
    // Vérifier le token et récupérer l'utilisateur
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Auth Middleware: Erreur vérification token Supabase:', error.message);
      return res.status(401).json({ error: `Authentification invalide: ${error.message}` });
    }

    if (!user) {
      console.log('Auth Middleware: Utilisateur non trouvé pour ce token.');
      return res.status(401).json({ error: 'Authentification invalide (Utilisateur non trouvé).' });
    }

    // Attacher l'ID utilisateur à la requête pour utilisation ultérieure
    req.userId = user.id;
    console.log(`Auth Middleware: Utilisateur ${user.id} authentifié.`);
    next(); // Passe au middleware/route suivant

  } catch (catchError) {
    console.error('Auth Middleware: Erreur inattendue:', catchError);
    return res.status(500).json({ error: 'Erreur interne lors de l\'authentification.' });
  }
};
// --- FIN AJOUT Middleware --- 

// --- ROUTES ---
// Route GET de base
app.get('/', (req, res) => {
  res.status(200).send('AudioDoc Visualizer Backend is running!');
});

// --- AJOUT: Fonction pour le traitement asynchrone ---
async function processJob(jobId, userId, fileBuffer, originalFileName, textInput, videoUrl, musicUrl) {
  console.log(`[${jobId}] Début du traitement asynchrone pour l'utilisateur ${userId}`);
  
  let plainText = '';
  let currentStatus = 'processing'; // Statut initial du traitement

  try {
    // --- Mise à jour initiale du statut --- 
    await supabase.from('ProcessingJobs').update({ status: currentStatus, updated_at: new Date().toISOString() }).eq('job_id', jobId);
    console.log(`[${jobId}] Statut mis à jour: ${currentStatus}`);

    // --- 1. Extraction du texte (OCR ou direct) --- 
    if (fileBuffer && originalFileName) {
      console.log(`[${jobId}] Fichier PDF reçu pour OCR: ${originalFileName}, taille: ${fileBuffer.length} bytes`);
      currentStatus = 'processing_ocr';
      await supabase.from('ProcessingJobs').update({ status: currentStatus, updated_at: new Date().toISOString() }).eq('job_id', jobId);
      console.log(`[${jobId}] Statut mis à jour: ${currentStatus}`);

      // --- Logique OCR (précédemment dans /api/generate) ---
      let uploadedFile; // Pour pouvoir le supprimer à la fin
      try {
        console.log(`[${jobId}] Étape 1/3 : Upload du fichier vers Mistral API...`);
        const uploadPayload = {
            file: { 
                fileName: originalFileName, 
                content: fileBuffer 
            },
            purpose: 'ocr'
        };
        uploadedFile = await mistralClient.files.upload(uploadPayload);
        console.log(`[${jobId}] Fichier uploadé avec succès. ID: ${uploadedFile.id}`);

        console.log(`[${jobId}] Étape 2/3 : Obtention de l'URL signée...`);
        const signedUrlResponse = await mistralClient.files.getSignedUrl({ fileId: uploadedFile.id });
        const documentUrl = signedUrlResponse.url;
        console.log(`[${jobId}] URL signée obtenue.`);

        console.log(`[${jobId}] Étape 3/3 : Appel de l'API Mistral OCR...`);
        const ocrResponse = await mistralClient.ocr.process({ 
           model: "mistral-ocr-latest", 
           document: {
               type: "document_url",
               documentUrl: documentUrl,
           }
        });
        console.log(`[${jobId}] Réponse OCR reçue. Nombre de pages traitées: ${ocrResponse.pages?.length}`);
        
        let inputText = '';
        if (ocrResponse.pages && ocrResponse.pages.length > 0) {
           inputText = ocrResponse.pages.map(page => page.markdown).join('\n\n');
        } else {
           console.warn(`[${jobId}] Mistral OCR n'a renvoyé aucune page de contenu.`);
           throw new Error('Aucun contenu textuel extrait par Mistral OCR.');
        }
        console.log(`[${jobId}] Texte extrait par Mistral OCR (longueur): ${inputText.length}`);
        
        console.log(`[${jobId}] Nettoyage du Markdown en texte brut...`);
        plainText = removeMd(inputText); 
        console.log(`[${jobId}] Texte après nettoyage Markdown (début): "${plainText.substring(0, 100)}..."`);

        // Mettre à jour la tâche Supabase avec le texte extrait et nouveau statut
        currentStatus = 'ocr_completed';
         const { error: updateTextError } = await supabase
           .from('ProcessingJobs')
           .update({ input_text: plainText, status: currentStatus, updated_at: new Date().toISOString() })
           .eq('job_id', jobId);

         if (updateTextError) {
            console.error(`[${jobId}] Erreur Supabase lors de la mise à jour du texte extrait:`, updateTextError);
             // Logguer l'erreur, mais continuer si possible ? Ou marquer comme failed ? 
             // Pour l'instant, on continue, mais on pourrait throw ici.
         } else {
             console.log(`[${jobId}] Texte extrait enregistré dans Supabase. Statut mis à jour: ${currentStatus}`);
         }

      } catch (ocrError) {
         console.error(`[${jobId}] Erreur pendant le traitement OCR:`, ocrError);
         // Remonter l'erreur pour qu'elle soit gérée dans le bloc catch principal de processJob
         throw new Error(`Erreur OCR: ${ocrError.message}`); 
      } finally {
         // Assurer la suppression du fichier Mistral même en cas d'erreur après upload
         if (uploadedFile?.id) {
           try {
              console.log(`[${jobId}] Tentative de suppression du fichier Mistral ${uploadedFile.id}...`);
              await mistralClient.files.delete({ fileId: uploadedFile.id });
              console.log(`[${jobId}] Fichier Mistral ${uploadedFile.id} supprimé.`);
            } catch (deleteError) {
               console.error(`[${jobId}] Erreur lors de la suppression du fichier Mistral ${uploadedFile.id}:`, deleteError);
               // Ne pas bloquer le reste du traitement pour une erreur de suppression
            }
         }
      }
      // --- Fin Logique OCR ---

    } else if (textInput) {
      // Gérer le cas où le texte est fourni directement
      plainText = textInput;
      currentStatus = 'text_provided';
      console.log(`[${jobId}] Texte fourni directement (longueur): ${plainText.length}`);
       // Mettre à jour la tâche Supabase avec le texte fourni
       const { error: updateTextError } = await supabase
           .from('ProcessingJobs')
           .update({ input_text: plainText, status: currentStatus, updated_at: new Date().toISOString() }) 
           .eq('job_id', jobId);
        if (updateTextError) {
            console.error(`[${jobId}] Erreur Supabase lors de la mise à jour du texte fourni:`, updateTextError);
            // Idem: logguer mais continuer pour l'instant
        } else {
             console.log(`[${jobId}] Texte fourni enregistré dans Supabase. Statut mis à jour: ${currentStatus}`);
         }
    } else {
      // Ce cas ne devrait plus arriver car géré avant l'appel, mais sécurité
      throw new Error('Aucune donnée d\'entrée (fichier ou texte) fournie à processJob.');
    }

    // --- Validation finale du texte avant de passer à la suite --- 
    if (!plainText || !plainText.trim()) {
        throw new Error('Le texte extrait ou fourni est vide après traitement.');
    }

    // --- 2. Appel à ElevenLabs pour générer l'audio et les timestamps --- 
    let elevenLabsResponseData;
    try {
      currentStatus = 'generating_audio';
      await supabase.from('ProcessingJobs').update({ status: currentStatus, updated_at: new Date().toISOString() }).eq('job_id', jobId);
      console.log(`[${jobId}] Statut mis à jour: ${currentStatus}. Appel de l'API ElevenLabs...`);

      const headers = {
        'Accept': 'application/json', // <<< IMPORTANT: Demander JSON pour avoir les timestamps
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      };
      const requestBody = {
        text: plainText,
        model_id: 'eleven_multilingual_v2', // Ou un autre modèle supportant les timestamps
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3, // Ajouté pour potentiellement améliorer la qualité
          use_speaker_boost: true
        },
        // IMPORTANT: Spécifier les optimisations pour le streaming avec timestamps si nécessaire
        // S'assurer que le modèle choisi supporte bien les timestamps
      };

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/with-timestamps`,
        requestBody,
        { headers: headers }
      );

      if (response.status !== 200) {
         console.error(`[${jobId}] Erreur ElevenLabs: Statut ${response.status}`, response.data);
         throw new Error(`Erreur ElevenLabs: Statut ${response.status}`);
      }

      elevenLabsResponseData = response.data;
      console.log(`[${jobId}] Réponse ElevenLabs reçue (audio_base64 + alignment).`);
      
      if (!elevenLabsResponseData.audio_base64 || !elevenLabsResponseData.alignment) {
        console.error(`[${jobId}] Réponse ElevenLabs incomplète. Manque audio_base64 ou alignment.`);
        throw new Error('Réponse ElevenLabs incomplète.');
      }

    } catch (elevenLabsError) {
      console.error(`[${jobId}] Erreur lors de l'appel à ElevenLabs:`, elevenLabsError.response ? elevenLabsError.response.data : elevenLabsError.message);
      throw new Error(`Erreur ElevenLabs: ${elevenLabsError.message}`);
    }

    // --- 3. Upload Audio vers Supabase Storage & Récupération URL --- 
    let audioPublicUrl = null;
    try {
        currentStatus = 'uploading_audio';
        await supabase.from('ProcessingJobs').update({ status: currentStatus, updated_at: new Date().toISOString() }).eq('job_id', jobId);
        console.log(`[${jobId}] Statut mis à jour: ${currentStatus}. Décodage et upload de l'audio...`);
        
        // Décoder le Base64 en Buffer
        const audioBuffer = Buffer.from(elevenLabsResponseData.audio_base64, 'base64');
        const audioFileName = `${jobId}.mp3`; // Nom du fichier basé sur jobId
        const bucketName = 'audioresults';

        // Upload vers Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(audioFileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true // Écrase le fichier s'il existe déjà (utile en cas de retry)
          });

        if (uploadError) {
          console.error(`[${jobId}] Erreur lors de l'upload vers Supabase Storage:`, uploadError);
          throw new Error(`Erreur Supabase Storage (Upload): ${uploadError.message}`);
        }

        console.log(`[${jobId}] Audio uploadé avec succès vers ${bucketName}/${audioFileName}`);

        // Récupérer l'URL publique
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(audioFileName);

        if (!urlData || !urlData.publicUrl) {
          console.error(`[${jobId}] Impossible de récupérer l'URL publique pour ${audioFileName}.`);
          throw new Error('Erreur Supabase Storage (Public URL).');
        }
        
        audioPublicUrl = urlData.publicUrl;
        console.log(`[${jobId}] URL publique obtenue: ${audioPublicUrl}`);

    } catch (storageError) {
        console.error(`[${jobId}] Erreur pendant le traitement Storage:`, storageError);
        throw new Error(`Erreur Storage: ${storageError.message}`);
    }

    // --- 4. Fusion Audio/Musique (TODO - Placeholder) ---
    // Ici, on ajouterait la logique FFmpeg si musicUrl est fourni.
    // Pour l'instant, on utilise directement l'URL de l'audio généré.
    let finalAudioUrl = audioPublicUrl;
    if (musicUrl) {
        console.log(`[${jobId}] TODO: Fusionner l'audio généré avec la musique: ${musicUrl}`);
        // Mettre à jour le statut pour indiquer le mixage...
        // const mixedAudioUrl = await mixAudioWithMusic(audioPublicUrl, musicUrl, jobId);
        // finalAudioUrl = mixedAudioUrl;
    }

    // --- 5. Mise à jour finale de la tâche Supabase --- 
    currentStatus = 'completed';
    const finalUpdatePayload = {
      status: currentStatus,
      updated_at: new Date().toISOString(),
      result_timestamps: elevenLabsResponseData.alignment, // Sauvegarde des timestamps
      result_final_url: finalAudioUrl, // <<< Utilisation de l'URL réelle!
      error_message: null // Effacer les erreurs précédentes si succès
    };

    const { error: finalUpdateError } = await supabase
      .from('ProcessingJobs')
      .update(finalUpdatePayload)
      .eq('job_id', jobId);

    if (finalUpdateError) {
      console.error(`[${jobId}] Erreur Supabase lors de la mise à jour finale:`, finalUpdateError);
      // Que faire ici? L'essentiel est fait, mais la DB n'est pas à jour.
      // Pourrait renvoyer une erreur spécifique ou loguer sévèrement.
    } else {
      console.log(`[${jobId}] Traitement terminé avec succès! Statut: ${currentStatus}`);
    }

  } catch (error) {
    // --- Gestion globale des erreurs pour ce job --- 
    console.error(`[${jobId}] ERREUR FATALE dans processJob:`, error);
    currentStatus = 'failed';
    const errorPayload = {
      status: currentStatus,
      updated_at: new Date().toISOString(),
      error_message: error.message || 'Erreur inconnue lors du traitement.'
    };
    try {
      await supabase.from('ProcessingJobs').update(errorPayload).eq('job_id', jobId);
      console.log(`[${jobId}] Statut mis à jour: ${currentStatus} avec message d'erreur.`);
    } catch (dbError) {
      console.error(`[${jobId}] ERREUR CRITIQUE: Impossible de mettre à jour le statut d'erreur dans Supabase:`, dbError);
    }
  }
}
// --- FIN AJOUT Fonction ---

// --- AJOUT: Route pour lancer le traitement (asynchrone) ---
app.post('/api/generate', authenticateUser, upload.single('pdfFile'), async (req, res) => {
  console.log('/api/generate: Requête reçue');
  // --- Récupération des données --- 
  const userId = req.userId; // Récupéré via le middleware authenticateUser
  const textInput = req.body.text; // <<< CORRIGÉ: Utiliser req.body.text au lieu de req.body.textInput
  const videoUrl = req.body.videoUrl || '/satisfying_video.mp4'; // Default si non fourni
  const musicUrl = req.body.musicUrl || null; // Optionnel
  const pdfFile = req.file; // Fichier PDF uploadé via multer

  // --- Validation des entrées --- 
  // La variable textInput contient maintenant la bonne valeur (ou undefined si pas de texte)
  if (!pdfFile && (!textInput || !textInput.trim())) { // Ajout de .trim() pour être sûr
    console.log('/api/generate: Ni fichier PDF ni texte valide fourni.');
    return res.status(400).json({ error: 'Veuillez fournir un fichier PDF ou du texte valide.' });
  }
  if (pdfFile && textInput && textInput.trim()) { // Ajout de .trim()
    console.log('/api/generate: Fichier PDF et texte fournis simultanément.');
    return res.status(400).json({ error: 'Veuillez fournir soit un fichier PDF, soit du texte, pas les deux.' });
  }

  // --- Création de l'entrée dans la base de données --- 
  const jobId = uuidv4(); // Générer un ID unique pour la tâche
  const initialJobData = {
    job_id: jobId,
    user_id: userId,
    status: 'pending', // Statut initial avant le démarrage du traitement
    video_url: videoUrl, 
    music_url: musicUrl, // Enregistrer l'URL de la musique choisie
    // input_text sera mis à jour plus tard si texte fourni ou après OCR
    // original_file_name sera mis à jour si fichier fourni
  };
  
  // Ajouter le nom du fichier original si uploadé
  if (pdfFile) {
    initialJobData.original_file_name = pdfFile.originalname;
  }

  try {
    const { data, error } = await supabase.from('ProcessingJobs').insert([initialJobData]).select();
    if (error) {
      console.error('/api/generate: Erreur Supabase lors de la création de la tâche:', error);
      return res.status(500).json({ error: `Erreur base de données: ${error.message}` });
    }
    console.log(`[/api/generate] Tâche ${jobId} créée dans Supabase pour l'utilisateur ${userId}.`);

    // --- Lancement du traitement asynchrone --- 
    // Lire le buffer du fichier si uploadé
    const fileBuffer = pdfFile ? pdfFile.buffer : null;
    const originalFileName = pdfFile ? pdfFile.originalname : null;
    // Utiliser textInput (qui contient maintenant req.body.text ou undefined)
    const textToProcess = textInput ? textInput.trim() : null;

    // Lancer processJob SANS await pour répondre immédiatement
    processJob(jobId, userId, fileBuffer, originalFileName, textToProcess, videoUrl, musicUrl);
    console.log(`[/api/generate] Traitement asynchrone pour ${jobId} lancé.`);

    // --- Réponse immédiate au client --- 
    res.status(202).json({ jobId: jobId }); // 202 Accepted

  } catch (error) {
    console.error('/api/generate: Erreur inattendue avant le lancement asynchrone:', error);
    // Si l'erreur survient après l'insertion DB mais avant la réponse, 
    // la tâche restera 'pending'. Idéalement, il faudrait la marquer comme 'failed' ici aussi.
    res.status(500).json({ error: 'Erreur serveur interne lors du lancement de la tâche.' });
  }
});
// --- FIN AJOUT Route ---

// --- AJOUT: Route pour vérifier le statut de la tâche ---
app.get('/api/task-status/:jobId', authenticateUser, async (req, res) => {
  const userId = req.userId;
  const jobId = req.params.jobId;
  console.log(`[/api/task-status] Vérification pour Job ${jobId}, Utilisateur ${userId}`);

  try {
    const { data: job, error } = await supabase
      .from('ProcessingJobs')
      .select('*') // Sélectionner toutes les colonnes
      .eq('job_id', jobId)
      .eq('user_id', userId) // IMPORTANT: Sécurité, ne renvoyer que les tâches de l'utilisateur
      .single(); // S'attendre à un seul résultat

    if (error) {
      if (error.code === 'PGRST116') { // Code d'erreur PostgREST pour "aucune ligne trouvée"
        console.log(`[/api/task-status] Tâche ${jobId} non trouvée ou non autorisée pour l'utilisateur ${userId}.`);
        return res.status(404).json({ error: 'Tâche non trouvée ou accès non autorisé.' });
      } else {
        console.error(`[/api/task-status] Erreur Supabase lors de la récupération de la tâche ${jobId}:`, error);
        return res.status(500).json({ error: `Erreur base de données: ${error.message}` });
      }
    }

    if (!job) {
       // Devrait être couvert par PGRST116, mais double sécurité
        console.log(`[/api/task-status] Tâche ${jobId} non trouvée (après vérif erreur) pour l'utilisateur ${userId}.`);
       return res.status(404).json({ error: 'Tâche non trouvée.' });
    }

    console.log(`[/api/task-status] Statut trouvé pour ${jobId}: ${job.status}`);
    res.status(200).json(job); // Renvoyer les détails complets de la tâche

  } catch (error) {
    console.error(`[/api/task-status] Erreur inattendue pour la tâche ${jobId}:`, error);
    res.status(500).json({ error: 'Erreur serveur interne lors de la vérification du statut.' });
  }
});
// --- FIN AJOUT Route ---

// Gestionnaire d'erreurs pour Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Le fichier est trop volumineux. La taille maximale autorisée est de 15MB.' });
    }
    return res.status(400).json({ error: `Erreur d'upload: ${err.message}` });
  }
  next(err);
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Serveur backend démarré sur http://localhost:${PORT}`);
});

// --- FIN DU FICHIER --- // Ajout pour clarté