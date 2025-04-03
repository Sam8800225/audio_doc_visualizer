// Importer les modules nécessaires (syntaxe ES Module)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis le fichier .env (s'il existe)
dotenv.config();

// Créer l'application Express
const app = express();

// Définir le port d'écoute
const PORT = process.env.PORT || 5001;

// === Middlewares ===
app.use(cors()); // Activer CORS
app.use(express.json()); // Activer le parsing JSON

// === Routes ===
// Route de test
app.get('/', (req, res) => {
  res.status(200).send('AudioDoc Visualizer Backend is running!');
});

// Route POST /api/generate (à venir)

// === Démarrage du serveur ===
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});