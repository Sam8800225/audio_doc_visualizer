// client/src/components/MediaPlayer.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaExpand, FaCompress, FaPlay, FaPause, FaGaugeHigh, FaMusic } from "react-icons/fa6";
import { FaVolumeUp } from "react-icons/fa";
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
function MediaPlayer({ audioUrl, videoUrl, musicUrl, text, alignment }) {
  // Refs
  const audioRef = useRef(null);
  const musicRef = useRef(null);
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
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [isVoiceSliderVisible, setIsVoiceSliderVisible] = useState(false);
  const [isMusicSliderVisible, setIsMusicSliderVisible] = useState(false);


  // --- Effets ---

  // Effet 1: Traiter l'alignement + Reset états liés à l'audio
  useEffect(() => {
    if (alignment && audioUrl) {
      const processedTimings = processAlignmentToWords(alignment);
      setWordTimings(processedTimings);
      setActiveWordIndex(-1);
      setCurrentTime(0);
      setPlaybackSpeed(1.0);
      if (audioRef.current) {
          audioRef.current.playbackRate = 1.0;
          audioRef.current.currentTime = 0;
      }
      if (videoRef.current) {
          videoRef.current.playbackRate = 1.0;
      }
    } else {
      setWordTimings([]);
      setActiveWordIndex(-1);
      setCurrentLineWords([]);
      setCurrentLineStartIndex(0);
      setCurrentTime(0);
      setPlaybackSpeed(1.0);
      setAudioDuration(0);
    }
  }, [alignment, audioUrl]);

  // Effet 2: Calculer le videoStartTime aléatoire
  useEffect(() => {
    if (audioDuration > 0 && videoDuration > 0) {
      const maxStartTime = Math.max(0, videoDuration - audioDuration);
      const randomStartTime = Math.random() * maxStartTime;
      setVideoStartTime(randomStartTime);

      if (videoRef.current) {
        videoRef.current.currentTime = randomStartTime;
      }
    } else {
         setVideoStartTime(0);
    }
  }, [audioDuration, videoDuration]);

  // --- Effet pour mettre à jour la LIGNE de mots affichée ---
  useEffect(() => {
    if (!wordTimings || wordTimings.length === 0) {
      if (currentLineWords.length > 0) setCurrentLineWords([]);
      if (currentLineStartIndex !== 0) setCurrentLineStartIndex(0);
      return;
    }

    if (!isPlaying && activeWordIndex === -1) {
        if (currentLineWords.length > 0) {
            console.log("Effect 3: Playback stopped/ended, clearing words.");
            setCurrentLineWords([]);
        }
        return;
    }

    if (activeWordIndex !== -1) {
      const targetLineStartIndex = Math.floor(activeWordIndex / 4) * 4;

      if (targetLineStartIndex !== currentLineStartIndex || currentLineWords.length === 0) {
        console.log(`Effect 3: Updating displayed line. activeIndex=${activeWordIndex}, new line starts at ${targetLineStartIndex}`);
        const endIndex = Math.min(targetLineStartIndex + 4, wordTimings.length);
        const newLineWords = wordTimings.slice(targetLineStartIndex, endIndex).map(wt => wt.word);
        setCurrentLineWords(newLineWords);
        setCurrentLineStartIndex(targetLineStartIndex);
      }
    }
  }, [activeWordIndex, wordTimings, currentLineStartIndex, isPlaying]);


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

  // AJOUT: Effet 6: Appliquer les volumes quand ils changent
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = voiceVolume;
    }
  }, [voiceVolume]);

  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.volume = musicVolume;
    }
  }, [musicVolume]);


  // --- Fonctions Handler ---

  // Mise à jour de l'Index et du temps actuel (throttled)
  const handleTimeUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < throttleDelay) return;
    lastUpdateTimeRef.current = now;

    if (!audioRef.current || !wordTimings || wordTimings.length === 0 || !isPlaying) return;

    const currentAudioTime = audioRef.current.currentTime;
    setCurrentTime(currentAudioTime);

    let foundWordIndex = -1;
    for (let i = 0; i < wordTimings.length; i++) {
      if (wordTimings[i].startTime <= currentAudioTime && wordTimings[i].endTime > currentAudioTime) {
        foundWordIndex = i;
        break;
      }
    }

    if (foundWordIndex === -1 && wordTimings.length > 0 && currentAudioTime >= wordTimings[wordTimings.length - 1].endTime) {
        foundWordIndex = -1;
    }

    if (foundWordIndex !== activeWordIndex ) {
       setActiveWordIndex(foundWordIndex);
    }

    if (videoRef.current && audioDuration > 0 && videoStartTime >= 0 && videoRef.current.currentTime >= (videoStartTime + audioDuration)) {
       videoRef.current.currentTime = videoStartTime;
       if (isPlaying) { videoRef.current.play().catch(e => console.error("Video replay error on loop:", e)); }
    }

    if (musicRef.current && audioDuration > 0 && musicRef.current.currentTime >= audioDuration) {
        musicRef.current.currentTime = 0;
        if (isPlaying) { musicRef.current.play().catch(e => console.error("Music replay error on loop:", e)); }
    }
  }, [wordTimings, activeWordIndex, audioDuration, videoStartTime, isPlaying]);

  // Play/Pause synchronisé
  const togglePlayPause = () => {
    if (!audioRef.current || !videoRef.current || audioDuration === 0) return;
    const newIsPlaying = !isPlaying;
    if (newIsPlaying) {
      if (musicRef.current && musicRef.current.paused) {
          musicRef.current.currentTime = 0;
      }
      const playPromises = [audioRef.current.play(), videoRef.current.play()];
      if (musicRef.current) {
          playPromises.push(musicRef.current.play());
      }
      Promise.all(playPromises)
        .then(() => { /* Play OK */ })
        .catch(error => { console.error("Erreur lecture:", error); setIsPlaying(false); });
    } else {
      audioRef.current.pause();
      videoRef.current.pause();
      if (musicRef.current) {
          musicRef.current.pause();
      }
    }
     setIsPlaying(newIsPlaying);
  };

  // Changement de vitesse
  const handleSpeedChange = (newSpeed) => {
     if (audioRef.current) audioRef.current.playbackRate = newSpeed;
     if (videoRef.current) videoRef.current.playbackRate = newSpeed;
     setPlaybackSpeed(newSpeed);
     setIsSpeedMenuOpen(false);
  };

  // Gestion de la fin de l'audio
  const handleAudioEnd = () => {
      console.log("Audio TTS terminé.");
      setIsPlaying(false);
      setActiveWordIndex(-1);
      setCurrentTime(audioDuration);
      if (videoRef.current) videoRef.current.pause();
      if (musicRef.current) musicRef.current.pause();
  };

  // Gestion clic sur barre de progression (Seek)
  const handleSeek = (event) => {
     if (!audioRef.current || !videoRef.current || !progressBarRef.current || audioDuration <= 0) return;
     const progressBarRect = progressBarRef.current.getBoundingClientRect();
     const clickPositionInBar = event.clientX - progressBarRect.left;
     const clickPercent = Math.max(0, Math.min(1, clickPositionInBar / progressBarRect.width));
     const targetAudioTime = clickPercent * audioDuration;

     audioRef.current.currentTime = targetAudioTime;
     setCurrentTime(targetAudioTime);

     const targetVideoTime = Math.min(videoDuration, videoStartTime + targetAudioTime);
     videoRef.current.currentTime = targetVideoTime;

     if (musicRef.current && isFinite(targetAudioTime)) {
        musicRef.current.currentTime = targetAudioTime;
     }

     let foundWordIndex = -1;
     for (let i = 0; i < wordTimings.length; i++) {
       if (wordTimings[i].startTime <= targetAudioTime && wordTimings[i].endTime > targetAudioTime) {
         foundWordIndex = i;
         break;
       }
     }
     setActiveWordIndex(foundWordIndex);
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

  // AJOUT: Handlers pour les volumes
  const handleVoiceVolumeChange = (event) => {
    const newVolume = parseFloat(event.target.value);
    setVoiceVolume(newVolume);
  };

  const handleMusicVolumeChange = (event) => {
    const newVolume = parseFloat(event.target.value);
    setMusicVolume(newVolume);
  };

  // AJOUT: Handlers pour basculer la visibilité des sliders
  const toggleVoiceSlider = () => {
    setIsVoiceSliderVisible(!isVoiceSliderVisible);
    setIsMusicSliderVisible(false); // Cacher l'autre slider
  };

  const toggleMusicSlider = () => {
    setIsMusicSliderVisible(!isMusicSliderVisible);
    setIsVoiceSliderVisible(false); // Cacher l'autre slider
  };


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
        onClick={togglePlayPause}
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

           {/* AJOUT: Contrôles de Volume (Structure modifiée) */} 
           <div className="volume-controls">
             {/* Volume Voix */} 
             <div className="volume-control-wrapper">
               <button onClick={toggleVoiceSlider} className="control-button icon-button" title="Volume Voix">
                 <FaVolumeUp />
               </button>
               {isVoiceSliderVisible && (
                 <div className="volume-slider-container vertical">
                   <input
                     type="range"
                     min="0"
                     max="1"
                     step="0.05"
                     value={voiceVolume}
                     onChange={handleVoiceVolumeChange}
                     className="volume-slider vertical"
                     orient="vertical"
                   />
                 </div>
               )}
             </div>

             {/* Volume Musique (seulement si musique présente) */} 
             {musicUrl && (
               <div className="volume-control-wrapper">
                  <button onClick={toggleMusicSlider} className="control-button icon-button" title="Volume Musique">
                     <FaMusic />
                  </button>
                  {isMusicSliderVisible && (
                     <div className="volume-slider-container vertical">
                         <input
                         type="range"
                         min="0"
                         max="1"
                         step="0.05"
                         value={musicVolume}
                         onChange={handleMusicVolumeChange}
                         className="volume-slider vertical"
                         orient="vertical"
                         />
                     </div>
                  )}
               </div>
             )}
           </div>

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

      {/* AJOUT: Audio Secondaire (Musique de Fond) */} 
      {musicUrl && (
          <audio
            ref={musicRef}
            src={musicUrl}
            loop={false}
          ></audio>
      )}

    </div> // Fin player-container
  );
}

export default MediaPlayer;

