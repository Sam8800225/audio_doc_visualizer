// client/src/components/MediaPlayer.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaExpand, FaCompress, FaPlay, FaPause, FaGaugeHigh } from "react-icons/fa6";
import './MediaPlayer.css'; // Import du fichier CSS

// --- Fonction Helper pour traiter l'alignement ---
// (Garde ici la fonction processAlignmentToWords inchangée - celle de la réponse #105)
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
    // console.log("Timings par mot traités (10 premiers):", words.slice(0, 10));
    return words;
}

// --- Fonction Helper pour formater le temps ---
const formatTime = (timeInSeconds) => {
  if (!timeInSeconds || !isFinite(timeInSeconds) || timeInSeconds < 0) return '00:00';
  const totalSeconds = Math.floor(timeInSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};


// --- Composant MediaPlayer ---
function MediaPlayer({ audioUrl, videoUrl, text, alignment }) {
  // Refs
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const progressBarRef = useRef(null); // Ref pour la barre de progression
  const currentAudioUrlRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  const throttleDelay = 150; // Délai un peu plus court pour la synchro texte?

  // États
  const [wordTimings, setWordTimings] = useState([]);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [currentLineWords, setCurrentLineWords] = useState([]);
  const [currentLineStartIndex, setCurrentLineStartIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoStartTime, setVideoStartTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);


  // --- Effets ---

  // Effet 1: Traiter l'alignement + Reset états liés à l'audio
  useEffect(() => {
    if (alignment && audioUrl) { // Attend aussi audioUrl pour être sûr
      // console.log("Effet 1: Traitement alignement & Reset...");
      const processedTimings = processAlignmentToWords(alignment);
      setWordTimings(processedTimings);
      setActiveWordIndex(-1);
      setCurrentTime(0); // Reset temps affiché
      setPlaybackSpeed(1.0); // Reset vitesse
      if (audioRef.current) {
          audioRef.current.playbackRate = 1.0;
          audioRef.current.currentTime = 0; // Reset temps audio réel
      }
      if (videoRef.current) {
          videoRef.current.playbackRate = 1.0;
          // Le videoStartTime sera recalculé par l'effet 2
      }
    } else {
      setWordTimings([]);
      setActiveWordIndex(-1);
      setCurrentLineWords([]);
      setCurrentLineStartIndex(0);
      setCurrentTime(0);
      setPlaybackSpeed(1.0);
      setAudioDuration(0);
      // setVideoStartTime(0); // Gardé par l'effet 2
    }
  }, [alignment, audioUrl]); // Dépend d'alignment ET audioUrl pour reset complet

  // Effet 2: Calculer le videoStartTime aléatoire
  useEffect(() => {
    if (audioDuration > 0 && videoDuration > 0) {
      // console.log(`Effect 2: Calculating StartTime...`);
      const maxStartTime = Math.max(0, videoDuration - audioDuration);
      const randomStartTime = Math.random() * maxStartTime;
      // console.log(`Effect 2: randomStartTime=${randomStartTime}`);
      setVideoStartTime(randomStartTime);

      if (videoRef.current) {
        // console.log(`Effect 2: Setting initial video currentTime to ${randomStartTime}`);
        videoRef.current.currentTime = randomStartTime;
      }
    } else {
         setVideoStartTime(0); // Reset si les durées ne sont pas valides
    }
  }, [audioDuration, videoDuration]);

  // --- Effet pour mettre à jour la LIGNE de mots affichée ---
  useEffect(() => {
    // Si les timings ne sont pas prêts, on vide et on sort.
    if (!wordTimings || wordTimings.length === 0) {
      if (currentLineWords.length > 0) setCurrentLineWords([]); // Vide si ce n'était pas vide
      if (currentLineStartIndex !== 0) setCurrentLineStartIndex(0);
      return;
    }

    // Si l'audio ne joue PAS ET que l'index actif est -1 (vraiment à l'arrêt/fini)
    if (!isPlaying && activeWordIndex === -1) {
        if (currentLineWords.length > 0) {
            console.log("Effect 3: Playback stopped/ended, clearing words.");
            setCurrentLineWords([]);
            // setCurrentLineStartIndex(0); // Optionnel : reset ou garder le dernier ? Gardons pour l'instant.
        }
        return; // On sort, on n'affiche rien
    }

    // Si on a un index actif (ou si on joue encore même si l'index est -1 entre les mots)
    if (activeWordIndex !== -1) {
      // Calcule l'index de début de la ligne de 4 qui CONTIENT le mot actif
      const targetLineStartIndex = Math.floor(activeWordIndex / 4) * 4;

      // Change la ligne affichée SEULEMENT si le début de ligne cible est différent
      // OU si la ligne actuelle est vide (cas initial)
      if (targetLineStartIndex !== currentLineStartIndex || currentLineWords.length === 0) {
        console.log(`Effect 3: Updating displayed line. activeIndex=${activeWordIndex}, new line starts at ${targetLineStartIndex}`);
        const endIndex = Math.min(targetLineStartIndex + 4, wordTimings.length);
        const newLineWords = wordTimings.slice(targetLineStartIndex, endIndex).map(wt => wt.word);
        setCurrentLineWords(newLineWords);
        setCurrentLineStartIndex(targetLineStartIndex);
      }
      // Si targetLineStartIndex === currentLineStartIndex, on ne touche pas à currentLineWords.
      // Le surlignage dans le JSX se basera sur activeWordIndex pour changer le mot en jaune.

    }
    // Si activeWordIndex est -1 MAIS isPlaying est TRUE (on est dans une pause entre mots),
    // on ne fait rien ici, currentLineWords garde sa valeur précédente.

  // Dépendances : index actif, les timings calculés, et l'état de lecture
  }, [activeWordIndex, wordTimings, currentLineStartIndex, isPlaying]); // isPlaying ajouté


  // Effet 4: Nettoyage de l'URL Blob (avec Ref)
  useEffect(() => { currentAudioUrlRef.current = audioUrl; }, [audioUrl]);
  useEffect(() => {
    return () => {
      if (currentAudioUrlRef.current) {
        console.log("Nettoyage de l'URL Blob (au démontage via ref):", currentAudioUrlRef.current);
        URL.revokeObjectURL(currentAudioUrlRef.current);
      }
    };
  }, []);

  // Effet 5: Synchro état Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => { setIsFullscreen(!!document.fullscreenElement); };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);


  // --- Fonctions Handler ---

  // Mise à jour de l'Index et du temps actuel (throttled)
  const handleTimeUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < throttleDelay) return; // Throttle
    lastUpdateTimeRef.current = now;

    if (!audioRef.current || !wordTimings || wordTimings.length === 0 || !isPlaying) return;

    const currentAudioTime = audioRef.current.currentTime;
    setCurrentTime(currentAudioTime); // Met à jour l'état du temps affiché

    let foundWordIndex = -1;
    for (let i = 0; i < wordTimings.length; i++) {
      if (wordTimings[i].startTime <= currentAudioTime && wordTimings[i].endTime > currentAudioTime) {
        foundWordIndex = i;
        break;
      }
    }

    if (foundWordIndex === -1 && wordTimings.length > 0 && currentAudioTime >= wordTimings[wordTimings.length - 1].endTime) {
        foundWordIndex = -1; // Dépassé la fin
    }

    // Met à jour l'index actif seulement s'il change ET s'il est valide
    if (foundWordIndex !== activeWordIndex ) {
       // console.log(`handleTimeUpdate: currentTime=${currentAudioTime.toFixed(2)}, new activeWordIndex=${foundWordIndex}`);
       setActiveWordIndex(foundWordIndex);
    }

    // Rembobine la vidéo
    if (videoRef.current && audioDuration > 0 && videoStartTime >= 0 && videoRef.current.currentTime >= (videoStartTime + audioDuration)) {
       videoRef.current.currentTime = videoStartTime;
       if (isPlaying) { videoRef.current.play().catch(e => console.error("Video replay error on loop:", e)); }
    }
  }, [wordTimings, activeWordIndex, audioDuration, videoStartTime, isPlaying]); // isPlaying ajouté

  // Play/Pause synchronisé
  const togglePlayPause = () => {
    if (!audioRef.current || !videoRef.current || audioDuration === 0) return; // Ne rien faire si pas prêt
    const newIsPlaying = !isPlaying;
    if (newIsPlaying) {
      // console.log(`togglePlayPause: Play clicked. Video starts at ${videoStartTime}`);
      if (videoRef.current) { videoRef.current.currentTime = videoStartTime; }
      Promise.all([audioRef.current.play(), videoRef.current.play()])
        .then(() => { /*console.log("Play command succeeded")*/; }) // Pas besoin de setIsPlaying ici
        .catch(error => { console.error("Erreur lecture:", error); setIsPlaying(false); });
    } else {
      audioRef.current.pause();
      videoRef.current.pause();
      // console.log("Pause");
    }
     setIsPlaying(newIsPlaying); // Met à jour l'état dans tous les cas (le catch corrigera si besoin)
  };

  // Changement de vitesse
  const handleSpeedChange = (newSpeed) => {
     if (audioRef.current) audioRef.current.playbackRate = newSpeed;
     if (videoRef.current) videoRef.current.playbackRate = newSpeed;
     setPlaybackSpeed(newSpeed);
     setIsSpeedMenuOpen(false);
     // console.log(`Playback speed set to: ${newSpeed}x`);
  };

  // Gestion de la fin de l'audio
  const handleAudioEnd = () => {
      console.log("***** AUDIO ONENDED EVENT FIRED *****");
      setIsPlaying(false);
      setActiveWordIndex(-1);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = videoStartTime;
      }
  };

  // Gestion clic sur barre de progression (Seek)
  const handleSeek = (event) => {
     if (!audioRef.current || !videoRef.current || !progressBarRef.current || audioDuration <= 0) return;
     const progressBarRect = progressBarRef.current.getBoundingClientRect();
     const clickPositionInBar = event.clientX - progressBarRect.left;
     const clickPercent = Math.max(0, Math.min(1, clickPositionInBar / progressBarRect.width));
     const targetAudioTime = clickPercent * audioDuration;
     // console.log(`Seek: Target audio time: ${targetAudioTime.toFixed(2)}`);

     // Applique le nouveau temps et met à jour l'état
     audioRef.current.currentTime = targetAudioTime;
     setCurrentTime(targetAudioTime); // Met à jour l'affichage

     // Applique à la vidéo avec décalage
     const targetVideoTime = Math.min(videoDuration, videoStartTime + targetAudioTime);
     videoRef.current.currentTime = targetVideoTime;

     // Force la reprise si on était en pause ? Non, l'utilisateur recliquera play si besoin.
  };

   // Gestion Fullscreen
   const toggleFullscreen = () => {
      const elem = playerContainerRef.current; if (!elem) return;
      if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => console.error(`Erreur passage plein écran: ${err.message}`));
      } else {
        document.exitFullscreen().catch(err => console.error(`Erreur sortie plein écran: ${err.message}`));
      }
   };

  // Gestion chargement métadonnées
  const handleAudioMetadata = () => { if (audioRef.current) { const d = audioRef.current.duration; if(d && isFinite(d)) setAudioDuration(d); else setAudioDuration(0); } }
  const handleVideoMetadata = () => { if (videoRef.current) { const d = videoRef.current.duration; if(d && isFinite(d)) setVideoDuration(d); else setVideoDuration(0); } }


  // --- Rendu JSX ---
  return (
    <div
      ref={playerContainerRef}
      className={`player-container ${isFullscreen ? 'fullscreen-active' : ''}`}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        muted playsInline
        onClick={togglePlayPause} // Clic sur vidéo = Play/Pause
        onLoadedMetadata={handleVideoMetadata}
        style={{ display: 'block', width: '100%', height: 'auto', cursor:'pointer' }}
       />

      {/* Affiche le texte seulement si on a des timings */}
      {wordTimings.length > 0 && (
         <div className="text-overlay">
           <span className="word-display-text" key={currentLineStartIndex}>
             {currentLineWords.map((word, indexInLine) => {
               const realWordIndex = currentLineStartIndex + indexInLine;
               const isHighlighted = (realWordIndex === activeWordIndex);
               return (
                 <React.Fragment key={realWordIndex}>
                   {indexInLine > 0 ? ' ' : ''}
                   <span className={isHighlighted ? 'highlighted-word' : ''}>
                     {word}
                   </span>
                 </React.Fragment>
               );
             })}
           </span>
         </div>
      )}

      {/* Affiche les contrôles seulement si l'audio est chargé */}
      {audioDuration > 0 && (
        <div className={`controls-bar ${!isPlaying ? 'visible-when-paused' : ''}`}>
           <button onClick={togglePlayPause} className="control-button" title={isPlaying ? 'Pause' : 'Play'}>
             {isPlaying ? <FaPause /> : <FaPlay />}
           </button>

           <span className="time-display">{formatTime(currentTime)}</span>
           <div ref={progressBarRef} onClick={handleSeek} className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${(currentTime / audioDuration) * 100}%` }} />
           </div>
           <span className="time-display">{formatTime(audioDuration)}</span>

           {/* Contrôle de Vitesse */}
           <div style={{ position: 'relative', display: 'inline-block' }}>
               <button onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)} className="control-button" title="Vitesse">
                  <FaGaugeHigh />
                  <span style={{ marginLeft: '5px', fontSize:'0.8em' }}>{playbackSpeed.toFixed(2)}x</span>
               </button>
               {isSpeedMenuOpen && (
                  <div className="speed-menu">
                      <ul>
                         {[1.0, 1.25, 1.5, 2.0].map((speed) => (
                           <li key={speed} className={playbackSpeed === speed ? 'active-speed' : ''} onClick={() => handleSpeedChange(speed)} >
                             {speed.toFixed(speed === 1.0 ? 1 : 2)}x
                           </li>
                         ))}
                      </ul>
                  </div>
               )}
           </div>

           {/* Bouton Plein Écran */}
           <button onClick={toggleFullscreen} className="control-button" title={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}>
             {isFullscreen ? <FaCompress /> : <FaExpand />}
           </button>
        </div>
      )}

      {/* Audio Caché */}
      <audio
        ref={audioRef} src={audioUrl}
        onLoadedMetadata={handleAudioMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnd}
        style={{ display: 'none' }}
       />

    </div> // Fin player-container
  );
}

export default MediaPlayer;

