import { createClient } from '@supabase/supabase-js'

// Récupérer les variables d'environnement spécifiques au frontend
// Vite utilise import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Erreur: Clés Supabase (VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY) manquantes pour le client frontend.");
  // Gérer l'erreur - peut-être afficher un message à l'utilisateur
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey) 