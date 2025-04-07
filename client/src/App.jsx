// client/src/App.jsx
import { useState } from 'react';
import axios from 'axios'; // Importation d'axios
import './App.css';
// Tu peux déjà ajouter les imports pour les composants qu'on vient de créer :
import InputController from './components/InputController';
import LoadingIndicator from './components/LoadingIndicator';
import MediaPlayer from './components/MediaPlayer';
import ErrorMessage from './components/ErrorMessage';

function App() {
  // --- États de l'application ---
  const [inputFile, setInputFile] = useState(null); // Stocke le fichier PDF sélectionné (objet File)
  const [inputText, setInputText] = useState('');   // Stocke le texte collé par l'utilisateur
  const [isLoading, setIsLoading] = useState(false); // Vrai si le backend traite la demande
  const [errorMessage, setErrorMessage] = useState('');
  const [audioResult, setAudioResult] = useState(null);

  // --- Fonctions (handlers, appel API) viendront ici ---

  // Appelée quand le texte du textarea change
  const handleTextChange = (newText) => {
    setInputText(newText); // Met à jour l'état du texte
    // Si l'utilisateur tape du texte, on considère qu'il n'utilise plus le fichier
    if (inputFile) setInputFile(null);
    setErrorMessage(''); // Efface les erreurs précédentes (Correction: utilise setErrorMessage)
    setAudioResult(null); // Efface aussi le résultat précédent
  };

  // Appelée quand un fichier est sélectionné
  const handleFileChange = (file) => {
    setInputFile(file); // Met à jour l'état du fichier
    // Si l'utilisateur choisit un fichier, on considère qu'il n'utilise plus le texte collé
    if (inputText) setInputText('');
    setErrorMessage(''); // Efface les erreurs précédentes (Correction: utilise setErrorMessage)
    setAudioResult(null); // Efface aussi le résultat précédent
  };

  // La fonction handleSubmit viendra ici aussi...

  // Fonction appelée lors du clic sur le bouton "Générer"
  const handleSubmit = async () => {
    // Vérifier si on a du texte ou un fichier (sécurité)
    if (!inputFile && !inputText.trim()) {
      setErrorMessage('Veuillez fournir un fichier PDF ou coller du texte.'); // Correction: utilise setErrorMessage
      return;
    }

    setIsLoading(true);    // Démarre le chargement
    setErrorMessage('');    // Efface les erreurs précédentes (Correction: utilise setErrorMessage)
    setAudioResult(null);    // Réinitialise l'état résultat

    try {
      // Récupère le texte qui sera effectivement envoyé (pour le stocker avec le résultat)
      const textToProcess = inputFile ? '(Texte extrait du PDF)' : inputText; // Simplification

      const result = await generateAudio(); // Appelle la fonction API, attend l'objet JSON

      // Vérifier si on a bien reçu les données attendues
      if (result && result.audio_base64 && result.alignment) {

        // --- Décodage de l'audio Base64 en Blob ---
        console.log("Décodage de l'audio Base64...");
        const audioBase64 = result.audio_base64;
        const binaryString = window.atob(audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
        // --- Fin Décodage ---

        // Créer une URL locale pour le Blob audio
        const audioUrl = URL.createObjectURL(audioBlob);
        console.log('Audio URL créé:', audioUrl);
        console.log('Données d\'alignement reçues:', result.alignment);

        // Met à jour l'état avec l'URL, les données d'alignement, et le texte original
        setAudioResult({
          audioUrl: audioUrl,
          alignment: result.alignment, // Stocke les données de timestamp
          originalText: textToProcess // Stocke le texte (simplifié ici)
        });
        // setError(null); // Déjà fait avec setErrorMessage('') plus haut

      } else {
        console.error("Réponse du backend invalide:", result);
        throw new Error("La réponse du backend n'a pas le format attendu (audio_base64/alignment manquants).");
      }

    } catch (err) {
      console.error("Erreur lors de la génération :", err);
      // Essayer d'extraire un message d'erreur plus clair depuis la réponse du backend
      // Axios place les détails de l'erreur dans err.response
      let apiErrorMessage = 'Une erreur inconnue est survenue.';
      if (err.response && err.response.data) {
        // Si la réponse est un Blob (cas d'erreur HTML retournée par le serveur?)
        if (err.response.data instanceof Blob && err.response.data.type === 'application/json') {
          try {
            // Essayons de lire le Blob comme du texte JSON
            const errorJsonText = await err.response.data.text();
            const errorData = JSON.parse(errorJsonText);
            apiErrorMessage = errorData.error || apiErrorMessage;
          } catch (parseError) {
            console.error("Impossible de parser le Blob d'erreur:", parseError);
            apiErrorMessage = 'Erreur backend non lisible.';
          }
        } else if (typeof err.response.data === 'object' && err.response.data.error) {
          // Si c'est un objet JSON avec une clé 'error'
          apiErrorMessage = err.response.data.error;
        } else if (typeof err.response.data === 'string') {
          apiErrorMessage = err.response.data;
        }
      } else if (err.message) {
         // Sinon, utilise le message d'erreur standard d'Axios ou JavaScript
        apiErrorMessage = err.message;
      }
      setErrorMessage(apiErrorMessage); // Correction: utilise setErrorMessage
    } finally {
      // Dans tous les cas (succès ou erreur), arrêter le chargement
      setIsLoading(false);
    }
  };

  // Fonction pour appeler l'API backend
  const generateAudio = async () => {
    const backendUrl = 'http://localhost:5001/api/generate';
    let dataToSend;
    let headers = {};

    // Prépare dataToSend (FormData ou JSON)
    if (inputFile) {
      dataToSend = new FormData();
      dataToSend.append('pdfFile', inputFile);
    } else if (inputText.trim()) {
      dataToSend = { text: inputText };
      headers['Content-Type'] = 'application/json';
    } else {
      throw new Error('Aucune donnée à envoyer.');
    }

    console.log('Appel API vers:', backendUrl);

    // Appel API avec Axios - SANS responseType: 'blob'
    const response = await axios.post(backendUrl, dataToSend, {
      headers: headers
      // PAS de responseType: 'blob' ici !
    });

    console.log('Réponse JSON/Base64 reçue du backend:', response.data);
    return response.data; // Renvoie l'objet JSON complet
  };

  return (
    <div className="App">
      <h1>AudioDoc Visualizer</h1>

      {/* Affiche le formulaire */}
      <InputController
        onTextChange={handleTextChange}
        onFileChange={handleFileChange}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />

      {/* Affiche l'indicateur si isLoading est vrai */}
      {isLoading && <LoadingIndicator />}

      {/* Affiche le message d'erreur si errorMessage n'est pas vide */}
      {errorMessage && <ErrorMessage message={errorMessage} />}

      {/* Affiche MediaPlayer SEULEMENT si audioResult existe */}
      {audioResult && (
        <MediaPlayer
          audioUrl={audioResult.audioUrl}     // URL du blob audio
          alignment={audioResult.alignment}   // Données de timestamp
          text={audioResult.originalText}     // Le texte original (simplifié pour l'instant)
          videoUrl="/satisfying_video.mp4"  // Chemin vers la vidéo statique
        />
      )}

    </div>
  );
}

export default App;
