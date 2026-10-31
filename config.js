// « self » fonctionne à la fois dans la page et dans le service worker.
self.APP_CONFIG = {
  // URL de déploiement de l'application Web Apps Script (se termine par /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbwebGB1WNEZWQaj5dLlrZuHkIU5yzr6JE8YlwheYOHIYO_X77fk02wCJv_iYRNSpldE/exec',
  NOM: 'Ateliers couture',
  SOUS_TITRE: 'CSE — réservation des sessions',

  // Notifications push : copier depuis la console Firebase (voir README).
  // Ces valeurs sont publiques par conception : elles peuvent être dans le dépôt.
  FIREBASE: {
    apiKey: 'AIzaSyAigmxEtGdtdc9pKn2xCTilS041C9UVAH4',
    authDomain: 'couture-62f6c.firebaseapp.com',
    projectId: 'couture-62f6c',
    messagingSenderId: '710573532136',
    appId: '1:710573532136:web:1209ae5e5f65a605f9fa5d'
  },
  // Cloud Messaging → Certificats Web Push → clé publique
  VAPID_KEY: ''
};
