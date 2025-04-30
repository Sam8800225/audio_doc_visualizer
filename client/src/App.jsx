// client/src/App.jsx
import { useState, useEffect, useRef } from 'react';
import axios from 'axios'; // Importation d'axios
import './App.css';
// Tu peux déjà ajouter les imports pour les composants qu'on vient de créer :
import InputController from './components/InputController';
import LoadingIndicator from './components/LoadingIndicator';
import MediaPlayer from './components/MediaPlayer';
import ErrorMessage from './components/ErrorMessage';
// AJOUT: Importer le client Supabase et le composant Auth
import { supabase } from './supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared'; // Pour le thème par défaut

// Définit les vidéos disponibles
const availableVideos = [
  { name: 'Minecraft Relax', path: '/satisfying_video.mp4' },
  { name: 'Subway Surf', path: '/subway.mp4' } // Assure-toi que le nom 'subway.mp4' est correct
];

// AJOUT: Définit les musiques disponibles
const availableMusic = [
  { name: 'Aucune', path: '' }, // Option pour ne pas avoir de musique
  { name: 'Classique', path: '/classique.mp3' },
  { name: 'Relaxante', path: '/relax.mp3' },
  { name: 'Épique', path: '/epic.mp3' },
];

// AJOUT: Fonction pour mapper le statut à un message et pourcentage
const getStatusInfo = (status) => {
  switch (status) {
    case 'submitting':
      return { message: "Envoi de la requête...", percentage: 5 };
    case 'pending':
      return { message: "Tâche en attente de traitement...", percentage: 10 };
    case 'processing':
      return { message: "Traitement général en cours...", percentage: 15 };
    case 'processing_ocr':
      return { message: "Extraction du texte (OCR)...", percentage: 30 };
    case 'ocr_completed':
    case 'text_provided': // Considérer ces étapes comme similaires en termes de progression
      return { message: "Texte extrait/préparé...", percentage: 40 };
    case 'generating_audio':
      return { message: "Génération de l'audio en cours...", percentage: 60 };
    case 'mixing_media':
      return { message: "Mixage de la vidéo et de l'audio...", percentage: 85 };
    case 'completed': // Normalement, isLoading devient false ici
      return { message: "Traitement terminé !", percentage: 100 };
    // Les statuts d'échec ne montreront pas la barre, mais un message d'erreur
    case 'failed':
    case 'initialization_failed':
    case 'status_check_failed':
      return { message: "Échec du traitement.", percentage: 0 }; 
    default:
      return { message: "", percentage: 0 };
  }
};

function App() {
  // --- États de l'application ---
  const [session, setSession] = useState(null); // AJOUT: État pour la session
  const [inputFile, setInputFile] = useState(null); // Stocke le fichier PDF sélectionné (objet File)
  const [inputText, setInputText] = useState('');   // Stocke le texte collé par l'utilisateur
  const [isLoading, setIsLoading] = useState(false); // Vrai si le backend traite la demande
  const [errorMessage, setErrorMessage] = useState('');
  const [audioResult, setAudioResult] = useState(null);
  const [selectedVideoPath, setSelectedVideoPath] = useState('/satisfying_video.mp4'); // Default Minecraft
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  // AJOUT: États pour la musique
  const [selectedMusicPath, setSelectedMusicPath] = useState(''); // Défaut: Aucune
  const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);

  // --- AJOUT: États pour le suivi de tâche asynchrone ---
  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(''); // ex: 'pending', 'processing_ocr', 'completed', 'failed'
  const [jobError, setJobError] = useState(''); // Erreur spécifique à la tâche
  const pollingIntervalRef = useRef(null); // Utiliser useRef pour stocker l'ID de l'intervalle
  // --- FIN AJOUT ---

  // AJOUT: useEffect pour gérer la session
  useEffect(() => {
    // Récupérer la session initiale au chargement
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      console.log("Session initiale récupérée:", session);
    })

    // Écouter les changements d'état d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      console.log("Supabase auth event:", _event, session);
    })

    // Nettoyer l'abonnement au démontage du composant
    return () => subscription.unsubscribe()
  }, [])

  // --- Fonctions (handlers, appel API) viendront ici ---

  // Appelée quand le texte du textarea change
  const handleTextChange = (newText) => {
    setInputText(newText); // Met à jour l'état du texte
    // Si l'utilisateur tape du texte, on considère qu'il n'utilise plus le fichier
    if (inputFile) setInputFile(null);
    setErrorMessage(''); // Efface les erreurs précédentes
    setAudioResult(null); // Efface aussi le résultat précédent
  };

  // Appelée quand un fichier est sélectionné
  const handleFileChange = (file) => {
    setInputFile(file); // Met à jour l'état du fichier
    // Si l'utilisateur choisit un fichier, on considère qu'il n'utilise plus le texte collé
    if (inputText) setInputText('');
    setErrorMessage(''); // Efface les erreurs précédentes
    setAudioResult(null); // Efface aussi le résultat précédent
  };

  // La fonction handleSubmit viendra ici aussi...

  // Fonction appelée lors du clic sur le bouton "Générer"
  // (Indirectement via selectMusicAndGenerate)
  const handleSubmit = async () => {
    if (!session?.access_token) {
      setErrorMessage("Erreur: Session utilisateur invalide ou expirée.");
      setIsLoading(false);
      return;
    }

    // --- AJOUT DEBUG ---
    console.log("--- Début handleSubmit ---");
    console.log("Valeur de inputFile:", inputFile);
    console.log("Valeur de inputText:", `'${inputText}'`); // Avec des quotes pour voir les espaces
    console.log("Valeur de inputText.trim():", `'${inputText.trim()}'`);
    console.log("Condition (!inputFile && !inputText.trim()):", (!inputFile && !inputText.trim()));
    // --- FIN AJOUT DEBUG ---

    // Vérifier si on a une entrée
    if (!inputFile && !inputText.trim()) {
        console.error("ERREUR: Condition de validation échouée !"); // Log en cas d'erreur
        setErrorMessage("Veuillez fournir un fichier PDF ou coller du texte.");
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setErrorMessage(''); // Réinitialiser les erreurs générales
    setAudioResult(null); // Réinitialiser les résultats précédents
    setCurrentJobId(null); // Réinitialiser l'ID de la tâche précédente
    setJobStatus('submitting'); // Statut initial pendant l'appel à /generate
    setJobError(''); // Réinitialiser l'erreur de tâche précédente

    // Arrêter le polling précédent s'il existe
    if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
    }

    try {
      // Appel de l'API pour *lancer* la génération et obtenir le Job ID
      // Passe les chemins vidéo/musique sélectionnés
      const jobId = await generateAudio(selectedVideoPath, selectedMusicPath);
      console.log("Job ID reçu:", jobId);

      // Stocker le Job ID et démarrer le polling
      setCurrentJobId(jobId);
      setJobStatus('pending'); // La tâche est maintenant en attente sur le backend
      startPolling(jobId); // <--- Fonction à créer

      // Note: On ne traite plus la réponse audio/alignement ici.
      // isLoading restera true jusqu'à ce que le polling se termine (completed/failed)

    } catch (err) {
      console.error("Erreur lors de l'initialisation de la génération :", err);
      let apiErrorMessage = 'Erreur lors du lancement de la tâche.';
      if (err.response?.data?.error) {
        apiErrorMessage = err.response.data.error;
      } else if (err.message) {
        apiErrorMessage = err.message;
      }
      setErrorMessage(apiErrorMessage); // Affiche l'erreur initiale
      setJobStatus('initialization_failed'); // Statut d'échec spécifique à l'init
      setIsLoading(false); // Arrêter le chargement car l'init a échoué
    }
    // Note: finally { setIsLoading(false); } est supprimé car le polling gère maintenant l'état isLoading
  };

  // Fonction pour appeler l'API backend (/api/generate)
  // MODIFIÉ: Accepte videoUrl/musicUrl, envoie ces données, et retourne SEULEMENT le jobId
  const generateAudio = async (videoUrl, musicUrl) => {
    const backendUrl = 'http://localhost:5001/api/generate';
    let dataToSend;
    let headers = {};

    if (!session?.access_token) {
      throw new Error("Session utilisateur invalide pour l'appel API.");
    }
    headers['Authorization'] = `Bearer ${session.access_token}`;

    if (inputFile) {
      dataToSend = new FormData();
      dataToSend.append('pdfFile', inputFile);
      // AJOUT: Ajouter les URLs au FormData
      if (videoUrl) dataToSend.append('videoUrl', videoUrl);
      if (musicUrl) dataToSend.append('musicUrl', musicUrl);
      // Pas besoin de Content-Type pour FormData, Axios le gère
    } else if (inputText.trim()) {
      // AJOUT: Ajouter les URLs à l'objet JSON
      dataToSend = {
        text: inputText,
        videoUrl: videoUrl || null, // Envoyer null si vide
        musicUrl: musicUrl || null,
      };
      headers['Content-Type'] = 'application/json';
    } else {
      throw new Error('Aucune donnée à envoyer.');
    }

    console.log('Appel API vers:', backendUrl, 'avec données:', dataToSend);
    const response = await axios.post(backendUrl, dataToSend, {
      headers: headers
    });

    // VÉRIFIER la réponse pour le jobId
    if (response.data && response.data.jobId) {
        console.log('Réponse reçue de /api/generate:', response.data);
        return response.data.jobId; // Retourne SEULEMENT le Job ID
    } else {
        console.error("Réponse invalide de /api/generate (jobId manquant):", response.data);
        throw new Error('Réponse invalide du serveur lors de l\'initialisation de la tâche.');
    }
  };

  // Fonction pour ouvrir la modale de choix vidéo
  const openVideoModal = () => {
    if (!inputFile && !inputText.trim()) {
       setErrorMessage('Veuillez fournir un fichier PDF ou coller du texte avant de choisir la vidéo.');
       return;
    }
    setErrorMessage(null);
    setIsVideoModalOpen(true); // Ouvre la modale vidéo
  };

  // MODIFICATION: Fonction appelée quand une vidéo est choisie DANS la modale Vidéo
  const selectVideoAndOpenMusicModal = (videoPath) => {
    setSelectedVideoPath(videoPath); // Met à jour la vidéo sélectionnée
    setIsVideoModalOpen(false);     // Ferme la modale vidéo
    setIsMusicModalOpen(true);      // OUVRE la modale musique
  };

  // AJOUT: Fonction appelée quand une musique est choisie DANS la modale Musique
  const selectMusicAndGenerate = (musicPath) => {
    setSelectedMusicPath(musicPath);
    setIsMusicModalOpen(false);
    handleSubmit(); // Appelle la fonction modifiée qui lance le processus
  };

  // Fonctions pour fermer les modales sans choisir
  const closeVideoModal = () => {
    setIsVideoModalOpen(false);
  };
  const closeMusicModal = () => {
    setIsMusicModalOpen(false);
  };

  // --- AJOUT: Fonctions pour le Polling ---
  const startPolling = (jobId) => {
    console.log(`[Job: ${jobId}] Démarrage du polling...`);
    // Exécuter immédiatement une première vérification
    checkJobStatus(jobId);

    // Puis vérifier toutes les 5 secondes (par exemple)
    pollingIntervalRef.current = setInterval(() => {
      checkJobStatus(jobId);
    }, 5000); // Intervalle de 5 secondes
  };

  const checkJobStatus = async (jobId) => {
    console.log(`[Job: ${jobId}] Vérification du statut...`);
    const statusUrl = `http://localhost:5001/api/task-status/${jobId}`;

    try {
      const response = await axios.get(statusUrl, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const jobData = response.data;
      console.log(`[Job: ${jobId}] Statut reçu:`, jobData.status, jobData);
      setJobStatus(jobData.status);

      // Traitement basé sur le statut
      if (jobData.status === 'completed') {
        console.log(`[Job: ${jobId}] Tâche terminée ! Résultats reçus:`, jobData);

        // --- MODIFICATION: Appliquer les changements en 2 temps ---
        // 1. Arrêter le chargement et le polling d'abord
        setIsLoading(false);
        setJobError('');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        // 2. Mettre à jour le résultat après un court délai
        setTimeout(() => {
          console.log(`[Job: ${jobId}] Mise à jour de audioResult après délai.`);
          setAudioResult({
             audioUrl: jobData.result_final_url || null,
             alignment: jobData.result_timestamps || null, 
             originalText: jobData.input_text || '',
             videoUrl: jobData.video_url,
             musicUrl: jobData.music_url
          });
        }, 100); // Délai de 100ms
        // --- FIN MODIFICATION ---

      } else if (jobData.status === 'failed') {
        console.error(`[Job: ${jobId}] La tâche a échoué:`, jobData.error_message);
        setJobError(jobData.error_message || 'La tâche a échoué sans message spécifique.');
        // Arrêter le polling et le chargement
        if (pollingIntervalRef.current) { // Vérifier si l'intervalle existe avant de clear
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setIsLoading(false);
        setAudioResult(null); 

      } else {
        // Statuts intermédiaires (pending, processing_ocr, generating_audio, mixing_media, etc.)
        // Le polling continue, isLoading reste true
        setJobError(''); 
      }

    } catch (err) {
      console.error(`[Job: ${jobId}] Erreur lors de la vérification du statut:`, err);
      // Gérer les erreurs spécifiques (ex: 404 job non trouvé, 401 non autorisé)
      let statusErrorMessage = 'Erreur lors de la récupération du statut de la tâche.';
      if (err.response?.status === 404) {
        statusErrorMessage = 'La tâche demandée n\'a pas été trouvée ou a expiré.';
        // Arrêter le polling car la tâche n'existe plus/pas
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        setIsLoading(false);
      } else if (err.response?.status === 401) {
        statusErrorMessage = 'Authentification invalide pour vérifier le statut.';
        // Probablement arrêter aussi
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        setIsLoading(false);
      } else if (err.response?.data?.error) {
         statusErrorMessage = err.response.data.error;
      }
      setJobError(statusErrorMessage);
      setJobStatus('status_check_failed'); // Un statut pour indiquer l'échec du polling lui-même
      // On pourrait décider d'arrêter le polling ici ou de réessayer ? Pour l'instant on arrête.
       if (pollingIntervalRef.current) {
           clearInterval(pollingIntervalRef.current);
           pollingIntervalRef.current = null;
           setIsLoading(false);
       }
    }
  };

  // --- AJOUT: Nettoyage de l'intervalle au démontage ---
  useEffect(() => {
    // Retourne une fonction de nettoyage
    return () => {
      if (pollingIntervalRef.current) {
        console.log("Nettoyage de l'intervalle de polling.");
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []); // Le tableau vide assure que cela ne s'exécute qu'au montage et au démontage
  // --- FIN AJOUT ---

  return (
    <div className="App">
      {!session ? (
        <div className="auth-container">
          <h2>Connexion / Inscription</h2>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }} // Thème par défaut
            providers={[]} // Pas de fournisseurs externes pour l'instant
            localization={{
              variables: {
                sign_in: {
                  email_label: 'Adresse e-mail',
                  password_label: 'Mot de passe',
                  button_label: 'Se connecter',
                  loading_button_label: 'Connexion en cours...',
                  social_provider_text: 'Se connecter avec',
                  link_text: 'Vous avez déjà un compte ? Connectez-vous'
                },
                sign_up: {
                  email_label: 'Adresse e-mail',
                  password_label: 'Mot de passe',
                  button_label: 'S\'inscrire',
                  loading_button_label: 'Inscription en cours...',
                  social_provider_text: 'S\'inscrire avec',
                  link_text: 'Pas encore de compte ? Inscrivez-vous'
                },
                forgotten_password: {
                    email_label: "Adresse e-mail",
                    password_label: "Votre mot de passe",
                    button_label: "Envoyer les instructions",
                    loading_button_label: "Envoi en cours...",
                    link_text: "Mot de passe oublié ?",
                },
                 update_password: {
                    password_label: "Nouveau mot de passe",
                    button_label: "Mettre à jour le mot de passe",
                    loading_button_label: "Mise à jour en cours...",
                 }
              }
            }}
          />
        </div>
      ) : (
        // --- Contenu principal de l'application (si connecté) ---
        <>
          <header className="app-header">
            <h1>AudioDoc Visualizer</h1>
            <button onClick={() => supabase.auth.signOut()} className="logout-button">Déconnexion</button>
          </header>

          {/* Zone de contrôle principale */}
          <div className="main-controls">
              
              {/* AJOUT: Section pour choisir l'input (fichier OU texte) */}
              <div className="input-selection">
                  {/* Input Fichier */}
                  <div className="file-input-area">
                      <label htmlFor="pdf-upload">Choisir un fichier PDF :</label>
                      <input 
                          type="file" 
                          id="pdf-upload"
                          accept=".pdf" 
                          onChange={(e) => handleFileChange(e.target.files[0])} 
                          disabled={isLoading} 
                      />
                      {inputFile && <p>Fichier sélectionné : {inputFile.name}</p>}
                  </div>

                  {/* Séparateur */}
                  <div className="separator">OU</div>

                  {/* Input Texte */}
                  <div className="text-input-area">
                      <label htmlFor="text-input">Coller votre texte ici :</label>
                      <textarea
                          id="text-input"
                          value={inputText}
                          onChange={(e) => handleTextChange(e.target.value)}
                          placeholder="Entrez votre texte..."
                          rows={5} // Ajustez si nécessaire
                          disabled={isLoading}
                      />
                  </div>
              </div>

              {/* Bouton pour ouvrir la modale de sélection vidéo */}
              {/* Condition: Ne montrer que si un input est fourni et pas en chargement */}
              {(!isLoading && (inputFile || inputText.trim())) && (
                 <button onClick={openVideoModal} disabled={isLoading} className="generate-button">
                     Choisir la Vidéo de Fond
                 </button>
              )}
          </div>

          {/* Affichage du statut/chargement */}
          {isLoading && (
            <LoadingIndicator statusInfo={getStatusInfo(jobStatus)} />
          )}
          {/* Affichage des erreurs générales OU spécifiques à la tâche */}
          {(errorMessage || jobError) && (
             <ErrorMessage message={errorMessage || jobError} />
          )}
          
          {/* Lecteur Média (affiché seulement si audioResult est prêt) */}
          {audioResult && !isLoading && (
            <MediaPlayer
              audioUrl={audioResult.audioUrl}
              videoUrl={audioResult.videoUrl} // Pass videoUrl to MediaPlayer
              alignment={audioResult.alignment}
              text={audioResult.originalText} // Passer le texte original
              musicUrl={audioResult.musicUrl} // Passer musicUrl to MediaPlayer
            />
          )}

          {/* Modale de sélection Vidéo */}
          {isVideoModalOpen && (
            <Modal isOpen={isVideoModalOpen} onClose={closeVideoModal}>
              <h2>Choisir une vidéo de fond</h2>
              <ul className="modal-list">
                {availableVideos.map((video) => (
                  <li key={video.path}>
                    <button onClick={() => selectVideoAndOpenMusicModal(video.path)}>
                      {video.name}
                    </button>
                  </li>
                ))}
              </ul>
            </Modal>
          )}
          
          {/* AJOUT: Modale de sélection Musique */}
          {isMusicModalOpen && (
            <Modal isOpen={isMusicModalOpen} onClose={closeMusicModal}>
              <h2>Choisir une musique de fond (Optionnel)</h2>
              <ul className="modal-list">
                {availableMusic.map((music) => (
                  <li key={music.path || 'none'}>
                    <button onClick={() => selectMusicAndGenerate(music.path)}>
                      {music.name}
                    </button>
                  </li>
                ))}
              </ul>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

// --- AJOUT: Composant simple pour la Modale ---
const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}> {/* Ferme en cliquant hors de la modale */}
      <div className="modal-content" onClick={e => e.stopPropagation()}> {/* Empêche la fermeture en cliquant dans la modale */}
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        {children}
      </div>
    </div>
  );
};

export default App;
