// « self » fonctionne à la fois dans la page et dans le service worker.
self.APP_CONFIG = {
  // URL de déploiement de l'application Web Apps Script (se termine par /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycby2OnQlwqeBFz67HMHhLcTNGoU9CYagF4MF6Gxx_9PLkMBstW6MrgzBM_G5dChW3n8x/exec',
  NOM: 'Ateliers couture',
  SOUS_TITRE: 'CSE — réservation des sessions',

  // Notifications push : copier depuis la console Firebase (voir README).
  // Ces valeurs sont publiques par conception : elles peuvent être dans le dépôt.
  FIREBASE: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    messagingSenderId: '',
    appId: ''
  },
  // Cloud Messaging → Certificats Web Push → clé publique
  VAPID_KEY: ''
};
