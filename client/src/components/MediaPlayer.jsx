// client/src/components/MediaPlayer.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
// MODIFIÉ: Séparer les imports fa et fa6
import { FaPlay, FaPause, FaExpand, FaCompress, FaMusic } from "react-icons/fa6"; 
import { FaVolumeUp } from "react-icons/fa"; // FaVolumeUp vient de fa
// Imports d'icônes commentés pour le test
import { FaGaugeHigh } from "react-icons/fa6";
import './MediaPlayer.css';

// --- Fonction Helper pour formater le temps (Réactivée) ---
const formatTime = (timeInSeconds) => {
  if (!timeInSeconds || !isFinite(timeInSeconds) || timeInSeconds < 0) return '00:00';
  const totalSeconds = Math.floor(timeInSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// --- Fonction Helper pour l'alignement (RÉACTIVÉE) ---
function processAlignmentToWords(alignmentData) {
    // Vérification ajoutée
    if (!alignmentData || !alignmentData.characters || !alignmentData.character_start_times_seconds || !alignmentData.character_end_times_seconds) {
        console.warn("processAlignmentToWords: Données d'alignement invalides ou manquantes.");
        return [];
    }
    const words = []; let currentWord = ''; let wordStartTime = -1;
    const chars = alignmentData.characters;
    const starts = alignmentData.character_start_times_seconds;
    const ends = alignmentData.character_end_times_seconds;
    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        if (char !== ' ' && char !== '\n' && char !== '\t') {
            if (currentWord === '') { wordStartTime = starts[i]; }
            currentWord += char;
        } else {
            if (currentWord !== '') {
                const wordEndTime = ends[i - 1];
                 // Vérifier si les temps sont valides
                 if (typeof wordStartTime === 'number' && typeof wordEndTime === 'number' && wordStartTime <= wordEndTime) {
                    words.push({ word: currentWord, startTime: wordStartTime, endTime: wordEndTime });
                 } else {
                    console.warn(`Mot invalide sauté: "${currentWord}" (start: ${wordStartTime}, end: ${wordEndTime})`);
                 }
                currentWord = ''; wordStartTime = -1;
            }
        }
    }
    if (currentWord !== '') {
        const wordEndTime = ends[chars.length - 1];
        if (typeof wordStartTime === 'number' && typeof wordEndTime === 'number' && wordStartTime <= wordEndTime) {
           words.push({ word: currentWord, startTime: wordStartTime, endTime: wordEndTime });
        } else {
            console.warn(`Dernier mot invalide sauté: "${currentWord}" (start: ${wordStartTime}, end: ${wordEndTime})`);
        }
    }
    console.log(`processAlignmentToWords: ${words.length} mots traités.`);
    return words;
}

// --- Composant MediaPlayer (Réintroduction Musique + Contrôles) ---
// Réactiver les props text et alignment
function MediaPlayer({ audioUrl, videoUrl, text, alignment, musicUrl }) { 
  // Refs
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const musicRef = useRef(null);
  const playerContainerRef = useRef(null);
  const progressBarRef = useRef(null); 
  const lastUpdateTimeRef = useRef(0);
  const throttleDelay = 150; 

  // États Généraux
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [displayTime, setDisplayTime] = useState(0); 
  
  // États Durées
  const [ttsDuration, setTtsDuration] = useState(0); 
  const [videoDuration, setVideoDuration] = useState(0); 
  const [musicDuration, setMusicDuration] = useState(0); 
  
  // États Segments Aléatoires
  const [videoStartTime, setVideoStartTime] = useState(0);
  const [musicStartTime, setMusicStartTime] = useState(0);
  const [targetEndTime, setTargetEndTime] = useState(0); 
  const [segmentCalculated, setSegmentCalculated] = useState(false);
  const durationsLoadedRef = useRef({ tts: false, video: false, music: !musicUrl });
  
  // États Volume
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [showVoiceVolumeSlider, setShowVoiceVolumeSlider] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [showMusicVolumeSlider, setShowMusicVolumeSlider] = useState(false);
  
  // États pour synchro texte (RÉACTIVÉS)
  const [wordTimings, setWordTimings] = useState([]);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [currentLineWords, setCurrentLineWords] = useState([]);
  const [currentLineStartIndex, setCurrentLineStartIndex] = useState(0);
  

  // --- Effets ---
  // Effet 1: Traiter l'alignement (MODIFIÉ pour reset displayTime)
  useEffect(() => {
    console.log("MediaPlayer useEffect[alignment]: alignment prop reçu:", alignment);
    setSegmentCalculated(false);
    durationsLoadedRef.current = { tts: false, video: false, music: !musicUrl };
    setVideoStartTime(0);
    setMusicStartTime(0);
    setTargetEndTime(0);
    setTtsDuration(0);
    setWordTimings([]); 
    setActiveWordIndex(-1);
    setDisplayTime(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (musicRef.current) musicRef.current.currentTime = 0;

    if (alignment) { 
      console.log("MediaPlayer: Traitement des données d'alignement reçues...");
      const processedTimings = processAlignmentToWords(alignment);
      setWordTimings(processedTimings);
    } else {
      console.log("MediaPlayer: Pas d'alignement, reset complet.");
    }
  }, [alignment, audioUrl, videoUrl, musicUrl]);

  // Effet 2: Mise à jour de la ligne de mots (RÉACTIVÉ)
  useEffect(() => {
    if (!wordTimings || wordTimings.length === 0) {
      if (currentLineWords.length > 0) setCurrentLineWords([]);
      if (currentLineStartIndex !== 0) setCurrentLineStartIndex(0);
      return;
    }
    // Si on est en pause et aucun mot n'est actif, on vide la ligne
    if (!isPlaying && activeWordIndex === -1) {
        if (currentLineWords.length > 0) setCurrentLineWords([]);
        return;
    }
    // Si un mot est actif, on calcule la ligne
    if (activeWordIndex !== -1) {
      const targetLineStartIndex = Math.floor(activeWordIndex / 4) * 4;
      // Mettre à jour seulement si la ligne de départ change
      if (targetLineStartIndex !== currentLineStartIndex) {
        const endIndex = Math.min(targetLineStartIndex + 4, wordTimings.length);
        const newLineWords = wordTimings.slice(targetLineStartIndex, endIndex).map(wt => wt.word);
        setCurrentLineWords(newLineWords);
        setCurrentLineStartIndex(targetLineStartIndex);
      }
    } else if (isPlaying && currentLineWords.length > 0) {
        // Si on joue mais aucun mot n'est actif (début/fin?), vider la ligne?
        // Optionnel, dépend du comportement souhaité
        // setCurrentLineWords([]); 
    }
  }, [activeWordIndex, wordTimings, currentLineStartIndex, isPlaying]);

  // AJOUT: Effet pour gérer le changement de mode plein écran
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // AJOUT: Effet pour mettre à jour le volume des éléments audio
  useEffect(() => {
      if(audioRef.current) audioRef.current.volume = voiceVolume;
  }, [voiceVolume]);

  useEffect(() => {
      if(musicRef.current) musicRef.current.volume = musicVolume;
  }, [musicVolume]);

  // <<< AJOUT: Effet pour calculer les segments quand les durées sont prêtes
  useEffect(() => {
    if (durationsLoadedRef.current.tts && durationsLoadedRef.current.video && durationsLoadedRef.current.music && ttsDuration > 0 && !segmentCalculated) {
        console.log(`Calcul des segments aléatoires: TTS=${ttsDuration}s, Vidéo=${videoDuration}s, Musique=${musicDuration}s`);
        
        let vStart = 0;
        if (videoDuration > ttsDuration) {
            vStart = Math.random() * (videoDuration - ttsDuration);
        } else {
            console.warn("La vidéo est plus courte que l'audio TTS !");
        }
        setVideoStartTime(vStart);
        setTargetEndTime(vStart + ttsDuration);

        let mStart = 0;
        if (musicUrl && musicDuration > ttsDuration) {
            mStart = Math.random() * (musicDuration - ttsDuration);
        } else if (musicUrl) {
            console.warn("La musique est plus courte que l'audio TTS !");
        }
        setMusicStartTime(mStart);
        
        // Initialiser le temps affiché à 0 et les éléments média à leur début de segment
        setDisplayTime(0);
        if(videoRef.current) videoRef.current.currentTime = vStart;
        if(audioRef.current) audioRef.current.currentTime = 0;
        if(musicRef.current) musicRef.current.currentTime = mStart;

        setSegmentCalculated(true);
        console.log("Segments calculés et prêts.");
    }
  }, [ttsDuration, videoDuration, musicDuration, segmentCalculated, musicUrl]);

  // --- Fonctions Helper Internes ---
  // Fonction pour vérifier si toutes les durées sont chargées
  const checkDurationsAndCalculate = useCallback(() => {
    if (durationsLoadedRef.current.tts && durationsLoadedRef.current.video && durationsLoadedRef.current.music && !segmentCalculated) {
      console.log("Toutes les durées sont chargées, prêt pour le calcul des segments via useEffect.")
    }
  }, [segmentCalculated]);

  // --- Fonctions Handler ---
  // handleTimeUpdate: MAJ pour calculer displayTime
  const handleTimeUpdate = useCallback(() => {
     const now = Date.now();
     if (now - lastUpdateTimeRef.current < throttleDelay) return;
     lastUpdateTimeRef.current = now;
 
     if (!videoRef.current || !isPlaying || !segmentCalculated) return; 
     
     const currentVideoTime = videoRef.current.currentTime;
     // Calculer le temps écoulé dans le segment pour l'affichage
     const currentDisplayTime = Math.max(0, currentVideoTime - videoStartTime);
     setDisplayTime(currentDisplayTime); // <<< Met à jour l'état pour l'UI

     // Vérifier fin de segment (basé sur temps vidéo réel)
     if (currentVideoTime >= targetEndTime) {
         console.log(`Fin du segment atteinte (Vidéo: ${currentVideoTime.toFixed(2)}s >= Target: ${targetEndTime.toFixed(2)}s). Arrêt.`);
         if (videoRef.current) videoRef.current.pause();
         if (audioRef.current) audioRef.current.pause();
         if (musicRef.current) musicRef.current.pause();
         setIsPlaying(false);
         // Rembobiner au début du segment
         if (videoRef.current) videoRef.current.currentTime = videoStartTime;
         if (audioRef.current) audioRef.current.currentTime = 0;
         if (musicRef.current) musicRef.current.currentTime = musicStartTime;
         setDisplayTime(0); // <<< Reset l'affichage à 0
         setActiveWordIndex(-1);
         return; 
     }
     // --- FIN Vérif fin segment ---

     // --- LOGIQUE DE SYNCHRO TEXTE (basée sur displayTime maintenant) ---
     if (wordTimings.length > 0) {
         // currentDisplayTime est équivalent à currentTtsTime
         let foundWordIndex = -1;
         const timeToCompare = currentDisplayTime; 
         for (let i = 0; i < wordTimings.length; i++) {
           if (wordTimings[i].startTime <= timeToCompare && wordTimings[i].endTime > timeToCompare) {
             foundWordIndex = i;
             break;
           }
         }
         if (foundWordIndex === -1 && timeToCompare >= ttsDuration) {
             foundWordIndex = -1; 
         }
         if (foundWordIndex !== activeWordIndex) {
             setActiveWordIndex(foundWordIndex);
         }
     }
     // --- FIN LOGIQUE SYNCHRO TEXTE ---

  }, [isPlaying, wordTimings, activeWordIndex, segmentCalculated, targetEndTime, videoStartTime, ttsDuration]);
  
  // togglePlayPause: MAJ pour reset displayTime
  const togglePlayPause = () => {
     if (!videoRef.current || !segmentCalculated) {
       console.warn("Play/Pause impossible: Segments non calculés.");
       return;
     }
     const canPlayVoice = audioRef.current && audioUrl;
     const canPlayMusic = musicRef.current && musicUrl;

     const newIsPlaying = !isPlaying;
     if (newIsPlaying) {
       // Positionner au début du segment
       console.log(`Démarrage lecture au début du segment: Vid=${videoStartTime.toFixed(2)}, Mus=${musicStartTime.toFixed(2)}, TTS=0`);
       videoRef.current.currentTime = videoStartTime;
       audioRef.current.currentTime = 0;
       if(canPlayMusic) musicRef.current.currentTime = musicStartTime;
       setDisplayTime(0); // <<< Reset l'affichage à 0 au play
       
       // Lancer la lecture
       const videoPlayPromise = videoRef.current.play();
       const voicePlayPromise = canPlayVoice ? audioRef.current.play() : Promise.resolve();
       const musicPlayPromise = canPlayMusic ? musicRef.current.play() : Promise.resolve();
       
       Promise.all([videoPlayPromise, voicePlayPromise, musicPlayPromise])
         .then(() => { setIsPlaying(true); })
         .catch(error => { 
             console.error("Erreur lecture:", error);
             setIsPlaying(false); 
             if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
             if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
             if (musicRef.current && !musicRef.current.paused) musicRef.current.pause();
         });

     } else {
       // Mettre tout en pause
       if (videoRef.current) videoRef.current.pause();
       if (canPlayVoice) audioRef.current.pause();
       if (canPlayMusic) musicRef.current.pause();
       setIsPlaying(false);
     }
  };

  // handleVideoEnd: MAJ pour reset displayTime
  const handleVideoEnd = () => {
      console.log("Événement 'ended' vidéo reçu. Resetting...");
      setIsPlaying(false);
      if (videoRef.current) videoRef.current.currentTime = videoStartTime;
      if (audioRef.current) audioRef.current.currentTime = 0;
      if (musicRef.current) musicRef.current.currentTime = musicStartTime;
      setDisplayTime(0); // <<< Reset l'affichage
      setActiveWordIndex(-1); 
  };
  
  // Handlers metadata (MODIFIÉ pour flag + calcul)
  const handleAudioMetadata = () => { 
      if (audioRef.current) { 
          const d = audioRef.current.duration; 
          if(d && isFinite(d)) {
            console.log("Durée TTS chargée:", d);
            setTtsDuration(d);
            durationsLoadedRef.current.tts = true;
            checkDurationsAndCalculate();
          } else { 
            setTtsDuration(0);
            durationsLoadedRef.current.tts = false;
          }
      } 
  };
  const handleVideoMetadata = () => { 
      if (videoRef.current) { 
          const d = videoRef.current.duration; 
          if(d && isFinite(d)) {
            console.log("Durée Vidéo chargée:", d);
            setVideoDuration(d);
            durationsLoadedRef.current.video = true;
            checkDurationsAndCalculate();
          } else { 
            setVideoDuration(0); 
            durationsLoadedRef.current.video = false;
          }
      } 
  };
  const handleMusicMetadata = () => {
    if (musicRef.current) {
      const d = musicRef.current.duration;
      if(d && isFinite(d)) {
        console.log("Durée Musique chargée:", d);
        setMusicDuration(d);
        durationsLoadedRef.current.music = true;
        checkDurationsAndCalculate();
      } else {
        setMusicDuration(0);
        durationsLoadedRef.current.music = false;
      }
    } else {
      // S'il n'y a pas de musique (musicUrl est null/vide), marquer comme chargé
      durationsLoadedRef.current.music = true;
      checkDurationsAndCalculate();
    }
  };

  // handleSeek: MAJ pour utiliser displayTime et ttsDuration
  const handleSeek = (event) => {
     if (!videoRef.current || !progressBarRef.current || !segmentCalculated || ttsDuration <= 0) return;
     
     const progressBarRect = progressBarRef.current.getBoundingClientRect();
     const clickPositionInBar = event.clientX - progressBarRect.left;
     const clickPercent = Math.max(0, Math.min(1, clickPositionInBar / progressBarRect.width));
     
     // Le pourcentage correspond directement au temps dans le segment TTS
     const targetDisplayTime = clickPercent * ttsDuration;

     // Calculer les temps réels pour chaque média
     const targetVideoTime = videoStartTime + targetDisplayTime;
     const targetMusicTime = musicStartTime + targetDisplayTime;
     const targetTtsTime = targetDisplayTime; // TTS = displayTime

     console.log(`Seek: ${clickPercent * 100}% -> Display/TTS Time: ${targetDisplayTime.toFixed(2)} -> Video Time: ${targetVideoTime.toFixed(2)}`);

     // Appliquer les temps
     if (videoRef.current) videoRef.current.currentTime = targetVideoTime;
     if (audioRef.current) audioRef.current.currentTime = targetTtsTime;
     if (musicRef.current) musicRef.current.currentTime = targetMusicTime;
     
     setDisplayTime(targetDisplayTime); // <<< Mettre à jour l'affichage

     // Mettre à jour l'index du mot surligné immédiatement
     if (wordTimings.length > 0) {
        let foundWordIndex = -1;
        const timeToCompare = targetDisplayTime; 
        for (let i = 0; i < wordTimings.length; i++) {
          if (wordTimings[i].startTime <= timeToCompare && wordTimings[i].endTime > timeToCompare) {
            foundWordIndex = i;
            break;
          }
        }
         if (foundWordIndex === -1 && timeToCompare >= ttsDuration) {
             foundWordIndex = -1; 
         }
        setActiveWordIndex(foundWordIndex); 
     }
  };

  // Handlers Volume et Plein écran (Identiques)
  const handleVoiceVolumeChange = (event) => {
    const newVolume = parseFloat(event.target.value);
    setVoiceVolume(newVolume);
  };
  const handleMusicVolumeChange = (event) => {
    const newVolume = parseFloat(event.target.value);
    setMusicVolume(newVolume);
  };
  const toggleVoiceVolumeSlider = () => {
    setShowVoiceVolumeSlider(!showVoiceVolumeSlider);
    setShowMusicVolumeSlider(false); 
  };
  const toggleMusicVolumeSlider = () => {
    setShowMusicVolumeSlider(!showMusicVolumeSlider);
    setShowVoiceVolumeSlider(false); 
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen()
        .catch(err => console.error(`Erreur passage plein écran: ${err.message} (${err.name})`));
    } else {
      document.exitFullscreen();
    }
  };

  // --- Rendu JSX (MODIFIÉ pour structure barre de contrôle) ---
  return (
    <div
      ref={playerContainerRef}
      className={`player-container ${isFullscreen ? 'fullscreen' : ''}`}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        muted 
        playsInline
        onClick={togglePlayPause} 
        onLoadedMetadata={handleVideoMetadata} // Déclenche calcul segment
        onTimeUpdate={handleTimeUpdate} // Gère fin de segment + synchro texte
        onEnded={handleVideoEnd} // Sécurité
        style={{ display: 'block', width: '100%', height: 'auto', cursor: 'pointer' }}
      />

      {/* Audio Voix (TTS) */}
      {audioUrl && (
        <audio
          ref={audioRef} 
          src={audioUrl}
          onLoadedMetadata={handleAudioMetadata} // Déclenche calcul segment
          style={{ display: 'none' }}
         />
      )}

      {/* Audio Musique */}
      {musicUrl && (
        <audio
          ref={musicRef}
          src={musicUrl}
          loop 
          onLoadedMetadata={handleMusicMetadata} // Déclenche calcul segment
          style={{ display: 'none' }}
        />
      )}
       
      {/* Barre de Contrôles (NOUVELLE STRUCTURE) */}
      {videoDuration > 0 && (
        <div className={`controls-bar ${!isPlaying ? 'visible-when-paused' : ''}`}>
          
          {/* === GROUPE GAUCHE === */}
          <div className="controls-left">
            <button onClick={togglePlayPause} className="control-button" title={isPlaying ? 'Pause' : 'Play'} disabled={!segmentCalculated}>
              {isPlaying ? <FaPause /> : <FaPlay />}
            </button>
            {/* AFFICHAGE TEMPS ACTUEL UNIQUEMENT */}
            <span className="time-display">{formatTime(displayTime)}</span> 
          </div>

          {/* === GROUPE CENTRE === */}
          <div className="controls-center">
            <div 
              ref={progressBarRef} 
              onClick={handleSeek}
              className="progress-bar-container"
              title={segmentCalculated ? "Cliquer pour naviguer dans le segment" : "Calcul du segment en cours..."}
              style={{ cursor: segmentCalculated ? 'pointer' : 'default' }} 
            >
                {segmentCalculated && ttsDuration > 0 && (
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${(displayTime / ttsDuration) * 100}%` }}
                  />
                )}
                {!segmentCalculated && (
                    <div className="progress-bar-fill" style={{ width: '0%', backgroundColor: '#888' }}/>
                )}
            </div> 
          </div>

          {/* === GROUPE DROITE === */}
          <div className="controls-right">
            {/* AFFICHAGE TEMPS TOTAL ICI */}
            <span className="time-display">{formatTime(ttsDuration)}</span>
            
            {/* BOUTON PLEIN ECRAN ICI */}
            <button onClick={toggleFullscreen} className="control-button" title={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}>
              {isFullscreen ? <FaCompress /> : <FaExpand />}
            </button>

            {/* CONTENEUR POUR LES CONTROLES DE VOLUME (maintenant après plein écran) */}
            <div className="volume-controls-container">
                {/* Volume Voix */}
                <div className="volume-control-wrapper"> 
                  <button onClick={toggleVoiceVolumeSlider} className="control-button icon-button" title="Volume Voix">
                    <FaVolumeUp />
                  </button>
                  {showVoiceVolumeSlider && (
                    <div className="volume-slider-container vertical">
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05" 
                        value={voiceVolume} 
                        onChange={handleVoiceVolumeChange} 
                        className="volume-slider slider-vertical" 
                       />
                    </div>
                  )}
                </div>
                {/* Volume Musique */}
                {musicUrl && (
                  <div className="volume-control-wrapper">
                    <button onClick={toggleMusicVolumeSlider} className="control-button icon-button" title="Volume Musique">
                      <FaMusic />
                    </button>
                    {showMusicVolumeSlider && (
                      <div className="volume-slider-container vertical">
                        <input 
                          type="range" 
                          min="0" max="1" step="0.05" 
                          value={musicVolume} 
                          onChange={handleMusicVolumeChange} 
                          className="volume-slider slider-vertical" 
                        />
                      </div>
                    )}
                  </div>
                )}
            </div> {/* Fin volume-controls-container */}

          </div> {/* Fin controls-right */}
           
        </div>
      )}
      
      {/* Overlay Texte (Basé sur activeWordIndex, lui-même basé sur temps TTS) */}
      {wordTimings.length > 0 && segmentCalculated && (
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
      {/* --- Fin Overlay Texte --- */} 

    </div>
  );
}

export default MediaPlayer;

