// client/src/components/InputController.jsx
import React from 'react';

// Le composant reçoit des 'props' de son parent (App.jsx)
function InputController({
  onTextChange,  // Fonction pour notifier App que le texte a changé
  onFileChange,  // Fonction pour notifier App qu'un fichier a été choisi
  onGenerateClick, // <<< Change onSubmit en onGenerateClick
  isLoading      // Booléen pour savoir si une opération est en cours
}) {

  // --- Handlers (Fonctions de gestion d'événements) ---
  // Appelé quand le contenu du textarea change
  const handleTextChange = (event) => {
    // Appelle la fonction 'onTextChange' passée en prop avec la nouvelle valeur
    onTextChange(event.target.value);
  };

  // Appelé quand un fichier est sélectionné dans l'input file
  const handleFileChange = (event) => {
    const file = event.target.files[0] || null; // Prend le fichier ou null s'il n'y en a pas
    // Appelle la fonction 'onFileChange' passée en prop avec le fichier
    onFileChange(file);
  };

  // Appelé quand le bouton est cliqué
  const handleGenerateClick = () => {
    // Appelle la fonction 'onGenerateClick' passée en prop (qui ouvrira la modale)
    onGenerateClick();
  };

  // --- Rendu JSX ---
  return (
    <div>
      {/* Zone pour coller le texte - SUPPRIMÉE */}
      {/* 
      <div>
        <label htmlFor="text-input">Coller votre texte ici :</label>
        <br />
        <textarea
          id="text-input"
          rows="10"
          cols="70"
          onChange={handleTextChange} // Appel du handler quand ça change
          disabled={isLoading}      // Désactivé si chargement
          placeholder="Entrez ou collez votre long texte ici..."
        />
      </div>
      */}
      
      {/* Premier séparateur <hr> - SUPPRIMÉ */}
      {/* <hr style={{ margin: '20px 0' }} /> */}

      {/* Zone pour uploader le PDF */}
      <div>
        <label htmlFor="pdf-input">Uploader un fichier PDF (max 15Mo) :</label> {/* Texte légèrement modifié */}
        <br />
        <input
          type="file"
          id="pdf-input"
          accept=".pdf" // Filtre les fichiers proposés
          onChange={handleFileChange} // Appel du handler quand un fichier est choisi
          disabled={isLoading}       // Désactivé si chargement
        />
      </div>

      <hr style={{ margin: '20px 0' }} /> {/* Garde le second séparateur */}

      {/* Bouton pour lancer la génération */}
      <button
        onClick={handleGenerateClick} // <<< Appelle onGenerateClick (qui ouvrira la modale)
        disabled={isLoading} // <<< Désactivé seulement pendant le chargement global
        style={{ padding: '10px 20px', fontSize: '1em' }}
      >
        {/* Change le texte du bouton */}
        {isLoading ? 'Génération...' : 'Générer la vidéo'}
      </button>
    </div>
  );
}

export default InputController;
