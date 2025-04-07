// client/src/components/InputController.jsx
import React from 'react';

// Le composant reçoit des 'props' de son parent (App.jsx)
function InputController({
  onTextChange,  // Fonction pour notifier App que le texte a changé
  onFileChange,  // Fonction pour notifier App qu'un fichier a été choisi
  onSubmit,      // Fonction pour notifier App de lancer la génération
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
  const handleSubmit = () => {
    // Appelle la fonction 'onSubmit' passée en prop
    onSubmit();
  };

  // --- Rendu JSX ---
  return (
    <div>
      {/* Zone pour coller le texte */}
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

      <hr style={{ margin: '20px 0' }} /> {/* Séparateur */}

      {/* Zone pour uploader le PDF */}
      <div>
        <label htmlFor="pdf-input">Ou uploader un fichier PDF (max 15Mo) :</label>
        <br />
        <input
          type="file"
          id="pdf-input"
          accept=".pdf" // Filtre les fichiers proposés
          onChange={handleFileChange} // Appel du handler quand un fichier est choisi
          disabled={isLoading}       // Désactivé si chargement
        />
      </div>

      <hr style={{ margin: '20px 0' }} /> {/* Séparateur */}

      {/* Bouton pour lancer la génération */}
      <button
        onClick={handleSubmit} // Appel du handler au clic
        disabled={isLoading}  // Désactivé si chargement
        style={{ padding: '10px 20px', fontSize: '1em' }}
      >
        {/* Texte conditionnel sur le bouton */}
        {isLoading ? 'Génération en cours...' : 'Générer l\'audio'}
      </button>
    </div>
  );
}

export default InputController;
