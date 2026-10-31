// « self » fonctionne à la fois dans la page et dans le service worker.
self.APP_CONFIG = {
  // URL de déploiement de l'application Web Apps Script (se termine par /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbyrwc6UmwyAp9zUDK1ZHV4GdMPhvwfYtn-ZzIIyrVsPN1hUO-kOfjINz8Zocv-Y58hv/exec',
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
  VAPID_KEY: 'BL4YCoBY5cQWkTTSzWF2qfvSZuxLpyeHtBIjYn6s7hZ-vN0B_yTyqv6AoyPYYZRr80X0xHZ4O48mR7sser1pjcc'
};
