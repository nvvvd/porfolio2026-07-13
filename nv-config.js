/* ============================================================================
   NV — Configuration du backend
   ----------------------------------------------------------------------------
   Ce fichier décide OÙ vivent les données du site.

   • backend: 'local'    -> localStorage. Le site fonctionne hors-ligne, aucune
                            base requise. C'est le mode démo (celui par défaut).
   • backend: 'supabase' -> base Postgres Supabase + Auth + temps réel.
                            Renseignez alors supabase.url et supabase.anonKey.

   La clé "anon" est PUBLIQUE par conception (protégée par les règles RLS de la
   base) : elle peut être commitée. Ne mettez JAMAIS ici la clé "service_role".
   ============================================================================ */
window.NV_CONFIG = {

  // 'local' (défaut) ou 'supabase'
  backend: 'supabase',

  supabase: {
    url: 'https://tigzlsawxcblyyobzhtn.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZ3psc2F3eGNibHl5b2J6aHRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5Mzk1NDYsImV4cCI6MjA5OTUxNTU0Nn0.o2XFQ6_cEFxLDK1Q2jUlzQUT-Zwb0rI-nKbuAJYTMJU',
  },

  /* --------------------------------------------------------------------------
     STOCKAGE DES PHOTOS — gardé EXTERNE pour ne rien payer côté base.
     La base ne stocke qu'une URL (ou un chemin court) par photo ; les fichiers
     vivent où vous voulez : Cloudflare R2, Backblaze B2, Bunny, Supabase
     Storage, ou même un lien direct Google Drive (voir docs/MIGRATION.md).
     -------------------------------------------------------------------------- */
  storage: {
    // Préfixe ajouté aux chemins "courts" (ex. "mariage/img_001.jpg").
    // Laissez vide si vous stockez déjà des URLs absolues complètes en base.
    baseUrl: '',

    // Optionnel : endpoint POST (multipart, champ "file") qui reçoit un fichier
    // et répond { "url": "https://..." }. Si vide, l'upload retombe en base64
    // local (démo) avec un avertissement dans la console.
    // → Worker Cloudflare prêt à déployer : docs/upload-worker.js
    uploadEndpoint: 'https://deploy.n-vivaudou.workers.dev',

    // Jeton envoyé en en-tête X-Upload-Token (doit correspondre au secret
    // UPLOAD_TOKEN du worker). Évite que des inconnus remplissent le bucket.
    uploadToken: '61d97d51-7ffb-495d-9972-348858660126-005d0cfe-c2ce-4c37-b57f-fa0ede74cc41',
  },

  // Temps réel : l'admin publie -> le client voit en direct (Supabase uniquement).
  realtime: true,

  /* --------------------------------------------------------------------------
     FORMULAIRE DE CONTACT — réception des messages par email.
     Les messages sont TOUJOURS enregistrés (visibles dans l'admin). En plus, si
     une clé Web3Forms est renseignée, chaque message est envoyé par email.

     Comment obtenir la clé (gratuit, 1 minute) :
       1. Allez sur https://web3forms.com
       2. Entrez l'adresse de réception : n.vivaudou@gmail.com
       3. La clé d'accès (access key) arrive par email — collez-la ci-dessous.
     La clé est publique par conception (elle ne fait qu'envoyer vers VOTRE email).
     -------------------------------------------------------------------------- */
  contact: {
    web3formsKey: '53770a7e-2963-4644-b8fe-b729e5323861',
    recipientLabel: 'n.vivaudou@gmail.com',
  },

  /* --------------------------------------------------------------------------
     MESURE D'AUDIENCE — Plausible (optionnel, sans cookie, conforme RGPD).
     1. Créez un compte sur https://plausible.io et ajoutez votre domaine.
     2. Renseignez le domaine ci-dessous (ex. 'nicolasvivaudou.com').
     Vide = aucun script chargé, aucune donnée collectée.
     -------------------------------------------------------------------------- */
  analytics: {
    plausibleDomain: '',
  },

  // Sur une base vide au premier lancement, pousser le contenu de démo.
  bootstrapIfEmpty: true,
};
