// client/src/components/MediaPlayer.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';

// --- Fonction Helper pour traiter l'alignement ---
// (Colle ici la fonction processAlignmentToWords de la réponse #105)
// Assure-toi qu'elle contient bien : console.log("Timings par mot traités (10 premiers):", words.slice(0, 10));
function processAlignmentToWords(alignmentData) {
  if (!alignmentData || !alignmentData.characters || !alignmentData.character_start_times_seconds || !alignmentData.character_end_times_seconds) {
    console.error("Données d'alignement invalides ou manquantes pour processAlignmentToWords");
    return [];
  }
  const words = []; let currentWord = ''; let wordStartTime = -1;
  const chars = alignmentData.characters; const starts = alignmentData.character_start_times_seconds; const ends = alignmentData.character_end_times_seconds;
  for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char !== ' ' && char !== '\n' && char !== '\t') {
          if (currentWord === '') { wordStartTime = starts[i]; }
          currentWord += char;
      } else {
          if (currentWord !== '') {
              const wordEndTime = ends[i - 1];
              words.push({ word: currentWord, startTime: wordStartTime, endTime: wordEndTime });
              currentWord = ''; wordStartTime = -1;
          }
      }
  }
  if (currentWord !== '') {
      const wordEndTime = ends[chars.length - 1];
      words.push({ word: currentWord, startTime: wordStartTime, endTime: wordEndTime });
  }
  console.log("Timings par mot traités (10 premiers):", words.slice(0, 10));
  return words;
}


// --- Composant MediaPlayer ---
function MediaPlayer({ audioUrl, videoUrl, text, alignment }) {
  // Refs
  const audioRef = useRef(null);
  const videoRef = useRef(null);

  // États
  const [wordTimings, setWordTimings] = useState([]);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [displayedWords, setDisplayedWords] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoStartTime, setVideoStartTime] = useState(0); // Point de départ aléatoire
  const lastUpdateTimeRef = useRef(0);
  const throttleDelay = 200; // Délai pour le throttle de timeupdate

  // --- Effets ---

  // Effet 1: Traiter l'alignement en mots quand il change
  useEffect(() => {
    if (alignment) {
      console.log("Effet 1: Traitement des données d'alignement...");
      const processedTimings = processAlignmentToWords(alignment);
      setWordTimings(processedTimings);
      setActiveWordIndex(-1); // Réinitialise l'index
      setVideoStartTime(0); // Réinitialise le start time vidéo aussi
    } else {
      setWordTimings([]);
      setActiveWordIndex(-1);
      setVideoStartTime(0);
    }
  }, [alignment]);

  // Effet 2: Calculer le videoStartTime quand les durées sont connues
  useEffect(() => {
    if (audioDuration > 0 && videoDuration > 0) {
      console.log(`Effect 2: Calculating StartTime. audioDuration=${audioDuration}, videoDuration=${videoDuration}`); // DEBUG LOG 1
      const maxStartTime = Math.max(0, videoDuration - audioDuration);
      const randomStartTime = Math.random() * maxStartTime;
      console.log(`Effect 2: maxStartTime=${maxStartTime}, calculated randomStartTime=${randomStartTime}`); // DEBUG LOG 2
      setVideoStartTime(randomStartTime); // Met à jour l'état

      // Essayer de définir currentTime de la vidéo ICI, dès qu'on le calcule
      if (videoRef.current) {
        console.log(`Effect 2: Setting video currentTime to ${randomStartTime}`); // DEBUG LOG 3
        videoRef.current.currentTime = randomStartTime;
        // Vérifier si ça a pris (peut être asynchrone ou échouer si media pas prêt)
        // setTimeout(() => console.log(`Effect 2: video currentTime after setting might be ${videoRef.current?.currentTime}`), 10); // Log async
        console.log(`Effect 2: video currentTime immediately after setting: ${videoRef.current.currentTime}`); // DEBUG LOG 4
      } else {
        console.log('Effect 2: videoRef not ready yet when calculating start time.'); // DEBUG LOG 5
      }
    }
  }, [audioDuration, videoDuration]); // Dépend des deux durées

  // Effet 3: Mettre à jour les mots affichés quand l'index actif change
  useEffect(() => {
    let currentWords = [];
    if (activeWordIndex !== -1 && wordTimings.length > 0) {
      const startIndex = activeWordIndex;
      const endIndex = Math.min(startIndex + 3, wordTimings.length);
      currentWords = wordTimings.slice(startIndex, endIndex).map(wt => wt.word);
      console.log(`Effect 3: Index actif: ${activeWordIndex}, Start/End Slice: [${startIndex}, ${endIndex}), Mots affichés: [${currentWords.join(', ')}]`); // DEBUG LOG 6
    } else {
       console.log("Effect 3: Index actif -1, Aucun mot à afficher."); // DEBUG LOG 7
    }
    setDisplayedWords(currentWords);
  }, [activeWordIndex, wordTimings]);

  // Effet 4: Nettoyage de l'URL Blob
  useEffect(() => {
    return () => {
      if (audioUrl) {
        // console.log("Nettoyage de l'URL Blob:", audioUrl); // Rendre moins verbeux
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);


  // --- Fonctions Handler ---

  // Mise à jour de l'Index (throttled)
  const handleTimeUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateTimeRef.current > throttleDelay) {
      lastUpdateTimeRef.current = now;

      if (!audioRef.current || !wordTimings || wordTimings.length === 0) return;

      const currentTime = audioRef.current.currentTime;
      let foundWordIndex = -1;

      // Trouve le mot où startTime <= currentTime < endTime
      for (let i = 0; i < wordTimings.length; i++) {
        if (wordTimings[i].startTime <= currentTime && wordTimings[i].endTime > currentTime) {
          foundWordIndex = i;
          break;
        }
      }

      // Si on est après la fin du dernier mot, on met l'index à -1
      if (foundWordIndex === -1 && wordTimings.length > 0 && currentTime >= wordTimings[wordTimings.length - 1].endTime) {
          foundWordIndex = -1;
      }

      if (foundWordIndex !== activeWordIndex) {
         console.log(`handleTimeUpdate: currentTime=${currentTime.toFixed(2)}, new activeWordIndex=${foundWordIndex}`); // DEBUG LOG 8
         setActiveWordIndex(foundWordIndex);
      }

      // Rembobine la vidéo au début du segment aléatoire si nécessaire
      // Vérifie videoStartTime >= 0 car il pourrait être 0 initialement
      if (videoRef.current && audioDuration > 0 && videoStartTime >= 0 && videoRef.current.currentTime >= (videoStartTime + audioDuration)) {
         // console.log(`Looping video back to ${videoStartTime}`);
         videoRef.current.currentTime = videoStartTime;
         if (isPlaying) {
            videoRef.current.play().catch(e => console.error("Video replay error on loop:", e));
         }
      }
    }
  }, [wordTimings, activeWordIndex, audioDuration, videoStartTime, isPlaying]); // Ajout de isPlaying aux dépendances

  // Play/Pause synchronisé
  const togglePlayPause = () => {
    if (!audioRef.current || !videoRef.current) return;

    if (isPlaying) {
      // Pause
      audioRef.current.pause();
      videoRef.current.pause();
      console.log("Pause");
    } else {
      // Play
      console.log(`togglePlayPause: Play clicked. Current videoStartTime state: ${videoStartTime}`); // DEBUG LOG 9
      // Positionne la vidéo AVANT de lancer play
      if (videoRef.current) {
          console.log(`togglePlayPause: Setting video currentTime to ${videoStartTime}`); // DEBUG LOG 10
          // --- POSSIBLE POINT DE PROBLEME : ESSAYER DE METTRE A JOUR currentTime JUSTE AVANT PLAY ---
          videoRef.current.currentTime = videoStartTime;
          console.log(`togglePlayPause: video currentTime after setting is ${videoRef.current.currentTime}`); // DEBUG LOG 11
      }
      // Lance les deux médias
      Promise.all([audioRef.current.play(), videoRef.current.play()])
        .then(() => {
            console.log("Play command succeeded (promises resolved)");
            // Met isPlaying à true seulement si play a réussi
            // Note : on le mettait en dehors avant, ce qui était peut-être trop tôt
            // MAIS si on le met ici, le bouton ne change qu'APRES le démarrage effectif...
            // Laisser en dehors semble mieux pour la réactivité du bouton.
        })
        .catch(error => {
          console.error("Erreur lors de la tentative de lecture (play promise rejected):", error);
          setIsPlaying(false); // Force l'état à false si la lecture échoue
        });
    }
     // Inverse l'état (peut être corrigé par le catch si play échoue)
     setIsPlaying(prevIsPlaying => !prevIsPlaying);
  };

  // Gestion de la fin de l'audio
  const handleAudioEnd = () => {
      console.log("Audio ended");
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
        // Rembobine au début du segment aléatoire joué
        videoRef.current.currentTime = videoStartTime;
      }
  }

  // Gestion du chargement des métadonnées
  const handleAudioMetadata = () => {
    if (audioRef.current) {
      const loadedAudioDuration = audioRef.current.duration;
      if (loadedAudioDuration && isFinite(loadedAudioDuration)) {
          setAudioDuration(loadedAudioDuration);
          console.log(`Audio duration loaded: ${loadedAudioDuration}`);
      } else {
          console.log("Audio duration is invalid or Infinity.");
          // Réinitialiser ?
          setAudioDuration(0);
          setVideoStartTime(0);
      }
    }
  }

  const handleVideoMetadata = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      if (duration && isFinite(duration)) {
        setVideoDuration(duration);
        console.log(`Video duration loaded: ${duration}`);
      } else {
         // Réinitialiser ?
         setVideoDuration(0);
         setVideoStartTime(0);
      }
    }
  }


  // --- Rendu JSX ---
  return (
    <div style={{ marginTop: '20px', border: '1px solid lightgray', padding: '10px', position: 'relative' }}>
      <h4>Lecteur Média</h4>
      <video
        ref={videoRef}
        src={videoUrl}
        width="640" height="360"
        muted playsInline
        onLoadedMetadata={handleVideoMetadata} // <--- Handler durée vidéo
        style={{ display: 'block', marginBottom: '10px', backgroundColor: 'black' }}
      >
        Votre navigateur ne supporte pas l'élément vidéo.
      </video>

      {/* Div pour afficher le texte superposé */}
      <div style={{
          position: 'absolute', bottom: '70px', left: '50%', transform: 'translateX(-50%)',
          width: '85%', textAlign: 'center', backgroundColor: 'rgba(0, 0, 0, 0.75)',
          color: 'white', padding: '10px 15px', borderRadius: '8px', fontSize: '1.8em',
          fontWeight: 'bold', fontFamily: 'Arial, Helvetica, sans-serif',
          textShadow: '1px 1px 3px rgba(0, 0, 0, 0.9)', maxHeight: '150px',
          overflowY: 'auto', zIndex: 10
      }}>
         <span>
            {/* Affiche le premier mot (l'actif) avec un fond jaune s'il existe */}
            {displayedWords.length > 0 && (
              <span style={{
                  backgroundColor: 'yellow',
                  color: 'black', // Texte noir sur fond jaune pour lisibilité
                  padding: '0 3px', // Petit espace intérieur
                  borderRadius: '3px' // Coins arrondis légers
                }}>
                {displayedWords[0]}
              </span>
            )}
            {/* Affiche les mots suivants (le 2ème et 3ème) s'ils existent, précédés d'un espace */}
            {displayedWords.length > 1 && (
              ' ' + displayedWords.slice(1).join(' ') // Prend les mots à partir de l'index 1
            )}
          </span>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={handleAudioMetadata} // <--- Handler durée audio
        onTimeUpdate={handleTimeUpdate}       // Handler pour synchro texte/boucle vidéo
        onEnded={handleAudioEnd}              // Handler pour fin audio
      >
        Votre navigateur ne supporte pas l'élément audio.
      </audio>

      {/* Bouton Play/Pause personnalisé */}
      <button
        onClick={togglePlayPause}
        style={{ padding: '10px 20px', fontSize: '1em', marginTop: '10px' }}
        disabled={!audioUrl || !wordTimings.length} // Désactivé tant que l'audio n'est pas chargé ET les timings prêts
      >
        {isPlaying ? 'Pause II' : 'Play ►'}
      </button>

    </div>
  );
}

export default MediaPlayer;

