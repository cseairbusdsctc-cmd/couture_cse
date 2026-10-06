(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const CLE_STOCKAGE = 'couture.session';

  let etat = { jeton: null, utilisateur: null, emailEnCours: '' };

  // ---------- Stockage local ----------
  function chargerSession() {
    try {
      const brut = localStorage.getItem(CLE_STOCKAGE);
      if (brut) Object.assign(etat, JSON.parse(brut));
    } catch (e) { /* stockage indisponible : on se reconnecte */ }
  }

  function enregistrerSession() {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ jeton: etat.jeton, utilisateur: etat.utilisateur }));
    } catch (e) { /* ignoré */ }
  }

  function oublierSession() {
    etat.jeton = null;
    etat.utilisateur = null;
    try { localStorage.removeItem(CLE_STOCKAGE); } catch (e) { /* ignoré */ }
  }

  // ---------- Appels à l'API Apps Script ----------
  // Pas d'en-tête Content-Type : la requête reste « simple » (text/plain) et évite le pré-contrôle CORS.
  async function api(action, donnees = {}) {
    let reponse;
    try {
      const res = await fetch(CFG.API_URL, {
        method: 'POST',
        body: JSON.stringify(Object.assign({ action, jeton: etat.jeton }, donnees))
      });
      reponse = await res.json();
    } catch (e) {
      return { ok: false, erreur: 'Connexion impossible. Vérifiez votre réseau et réessayez.', code: 'RESEAU' };
    }
    if (!reponse.ok && reponse.code === 'AUTH') {
      oublierSession();
      afficherConnexion();
    }
    return reponse;
  }

  // ---------- Messages ----------
  let minuteurToast;
  function message(texte, erreur = false) {
    const t = $('toast');
    t.textContent = texte;
    t.classList.toggle('erreur', erreur);
    t.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { t.hidden = true; }, erreur ? 6000 : 4000);
  }

  function occupe(bouton, actif, libelle) {
    if (!bouton) return;
    if (actif) {
      bouton.dataset.libelle = bouton.textContent;
      bouton.textContent = libelle || 'Patientez…';
      bouton.disabled = true;
    } else {
      bouton.textContent = bouton.dataset.libelle || bouton.textContent;
      bouton.disabled = false;
    }
  }

  // ---------- Écrans ----------
  function afficherConnexion() {
    $('ecran-sessions').hidden = true;
    $('zone-compte').hidden = true;
    $('ecran-connexion').hidden = false;
    $('etape-email').hidden = false;
    $('etape-code').hidden = true;
    $('champ-email').value = etat.emailEnCours || '';
  }

  function afficherEtapeCode() {
    $('etape-email').hidden = true;
    $('etape-code').hidden = false;
    $('texte-code').textContent =
      `Si ${etat.emailEnCours} est l'adresse d'un adhérent, un code vient d'y être envoyé. Il est valable 10 minutes.`;
    $('champ-code').value = '';
    $('champ-code').focus();
  }

  function afficherSessions() {
    $('ecran-connexion').hidden = true;
    $('ecran-sessions').hidden = false;
    $('zone-compte').hidden = false;
    const u = etat.utilisateur || {};
    $('nom-utilisateur').textContent = [u.prenom, u.nom].filter(Boolean).join(' ') || u.email || '';
    afficherAideInstallation();
    chargerSessions();
  }

  // ---------- Connexion ----------
  async function demanderCode() {
    const email = $('champ-email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message('Saisissez une adresse e-mail valide.', true);
      return;
    }
    etat.emailEnCours = email;
    const bouton = $('btn-code');
    occupe(bouton, true, 'Envoi…');
    const r = await api('demanderCode', { email });
    occupe(bouton, false);
    if (!r.ok) { message(r.erreur, true); return; }
    afficherEtapeCode();
  }

  async function seConnecter() {
    if ($('btn-connexion').disabled) return;
    const code = $('champ-code').value.replace(/\D/g, '');
    if (code.length !== 6) { message('Le code contient 6 chiffres.', true); return; }
    const bouton = $('btn-connexion');
    occupe(bouton, true, 'Vérification…');
    const r = await api('verifierCode', { email: etat.emailEnCours, code });
    occupe(bouton, false);
    if (!r.ok) { message(r.erreur, true); return; }
    etat.jeton = r.jeton;
    etat.utilisateur = r.utilisateur;
    enregistrerSession();
    afficherSessions();
  }

  async function seDeconnecter() {
    await api('deconnexion');
    oublierSession();
    afficherConnexion();
  }

  // ---------- Sessions ----------
  const fmt = (options) => new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: 'Europe/Paris' }, options));
  const fmtJourSemaine = fmt({ weekday: 'short' });
  const fmtJour = fmt({ day: 'numeric' });
  const fmtMoisCourt = fmt({ month: 'short' });
  const fmtMoisAnnee = fmt({ month: 'long', year: 'numeric' });
  const fmtHeure = fmt({ hour: '2-digit', minute: '2-digit' });
  const fmtComplet = fmt({ weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  const heure = (d) => fmtHeure.format(d).replace(':', 'h');

  function echapper(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function chargerSessions() {
    $('chargement').hidden = false;
    const r = await api('sessions');
    $('chargement').hidden = true;
    if (!r.ok) {
      if (r.code !== 'AUTH') message(r.erreur, true);
      return;
    }
    rendreSessions(r.sessions);
  }

  function rendreSessions(sessions) {
    const conteneur = $('liste-sessions');
    if (!sessions.length) {
      conteneur.innerHTML = '<div class="vide"><p>Aucune session n\'est prévue pour le moment. ' +
        'Les nouvelles sessions apparaîtront ici dès qu\'elles seront ajoutées.</p></div>';
      return;
    }

    let moisCourant = '';
    let html = '';
    sessions.forEach((s) => {
      const debut = new Date(s.debut);
      const fin = new Date(s.fin);
      const mois = fmtMoisAnnee.format(debut);
      if (mois !== moisCourant) {
        html += `<h3 class="mois">${echapper(mois)}</h3>`;
        moisCourant = mois;
      }
      html += carteSession(s, debut, fin);
    });
    conteneur.innerHTML = html;
  }

  function carteSession(s, debut, fin) {
    let statut = '';
    let action = '';

    if (s.inscrit) {
      statut = '<span class="statut inscrit">Vous êtes inscrit·e</span>';
      action = `<button class="bouton secondaire" data-action="desinscrire" data-id="${echapper(s.id)}">Me désinscrire</button>`;
    } else if (!s.ouvert) {
      statut = '<span class="statut ferme">Inscriptions fermées</span>';
    } else if (s.complet && s.enAttente) {
      statut = '<span class="statut complet">Complet, vous serez prévenu·e si une place se libère</span>';
      action = `<button class="bouton secondaire" data-action="quitterAttente" data-id="${echapper(s.id)}">Ne plus être prévenu·e</button>`;
    } else if (s.complet) {
      statut = '<span class="statut complet">Complet</span>';
      action = `<button class="bouton secondaire" data-action="rejoindreAttente" data-id="${echapper(s.id)}">Me prévenir si une place se libère</button>`;
    } else {
      action = `<button class="bouton principal" data-action="inscrire" data-id="${echapper(s.id)}">M'inscrire</button>`;
    }

    let blocInscrits = '';
    if (Array.isArray(s.inscrits)) {
      const liste = s.inscrits.length
        ? '<ul>' + s.inscrits.map((p) => {
            const reponse = p.statut === 'accepted' ? '' :
              p.statut === 'tentative' ? ' <span class="attente-reponse">(peut-être)</span>' :
              ' <span class="attente-reponse">(n\'a pas encore répondu)</span>';
            return `<li>${echapper(p.nom)}${reponse}</li>`;
          }).join('') + '</ul>'
        : '<p>Personne pour l\'instant.</p>';
      blocInscrits = `<details class="inscrits"><summary>${s.nbInscrits} inscrit${s.nbInscrits > 1 ? 's' : ''} sur ${s.places} places</summary>${liste}</details>`;
    }

    return `
      <article class="session${s.inscrit ? ' inscrite' : ''}" aria-label="${echapper(s.titre)}, ${echapper(fmtComplet.format(debut))}">
        <div class="etiquette-date" aria-hidden="true">
          <span class="jour-semaine">${echapper(fmtJourSemaine.format(debut))}</span>
          <span class="jour">${echapper(fmtJour.format(debut))}</span>
          <span class="mois-court">${echapper(fmtMoisCourt.format(debut))}</span>
        </div>
        <div>
          <h3>${echapper(s.titre)}</h3>
          <p class="infos">${heure(debut)} à ${heure(fin)}${s.lieu ? '<br>' + echapper(s.lieu) : ''}</p>
          ${s.description ? `<p class="description">${echapper(s.description)}</p>` : ''}
          ${statut}
        </div>
        ${action ? `<div class="actions">${action}</div>` : ''}
        ${blocInscrits}
      </article>`;
  }

  const LIBELLES_EN_COURS = {
    inscrire: 'Inscription…',
    desinscrire: 'Désinscription…',
    rejoindreAttente: 'Enregistrement…',
    quitterAttente: 'Enregistrement…'
  };

  async function surClicListe(e) {
    const bouton = e.target.closest('button[data-action]');
    if (!bouton) return;
    const action = bouton.dataset.action;
    if (action === 'desinscrire' && !window.confirm('Vous désinscrire de cette session ? Votre place sera proposée à d\'autres adhérents.')) {
      return;
    }
    occupe(bouton, true, LIBELLES_EN_COURS[action]);
    const r = await api(action, { eventId: bouton.dataset.id });
    occupe(bouton, false);
    if (r.code === 'AUTH') return;
    message(r.ok ? r.message : r.erreur, !r.ok);
    chargerSessions();
  }

  // ---------- Installation sur l'écran d'accueil ----------
  let invitationInstallation = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    invitationInstallation = e;
    afficherAideInstallation();
  });

  function afficherAideInstallation() {
    const zone = $('aide-installation');
    const installee = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (installee || $('ecran-sessions').hidden) { zone.hidden = true; return; }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (invitationInstallation) {
      zone.innerHTML = 'Installez l\'application pour la retrouver sur votre écran d\'accueil. ' +
        '<button class="lien" id="btn-installer" type="button">Installer</button>';
      zone.hidden = false;
      $('btn-installer').addEventListener('click', async () => {
        invitationInstallation.prompt();
        await invitationInstallation.userChoice;
        invitationInstallation = null;
        zone.hidden = true;
      });
    } else if (ios) {
      zone.textContent = 'Pour l\'installer : touchez le bouton Partager de Safari, puis « Sur l\'écran d\'accueil ».';
      zone.hidden = false;
    } else {
      zone.hidden = true;
    }
  }

  // ---------- Démarrage ----------
  function demarrer() {
    $('titre-appli').textContent = CFG.NOM || 'Ateliers couture';
    $('sous-titre').textContent = CFG.SOUS_TITRE || '';
    document.title = CFG.NOM || document.title;

    $('btn-code').addEventListener('click', demanderCode);
    $('champ-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') demanderCode(); });
    $('btn-connexion').addEventListener('click', seConnecter);
    $('champ-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') seConnecter(); });
    $('champ-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      if (e.target.value.length === 6) seConnecter();
    });
    $('btn-renvoyer').addEventListener('click', async () => {
      const r = await api('demanderCode', { email: etat.emailEnCours });
      message(r.ok ? 'Nouveau code envoyé.' : r.erreur, !r.ok);
    });
    $('btn-changer-email').addEventListener('click', afficherConnexion);
    $('btn-deconnexion').addEventListener('click', seDeconnecter);
    $('btn-actualiser').addEventListener('click', chargerSessions);
    $('liste-sessions').addEventListener('click', surClicListe);

    // Actualise quand on revient dans l'application
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && etat.jeton && !$('ecran-sessions').hidden) chargerSessions();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* fonctionne aussi sans */ });
    }

    chargerSession();
    if (etat.jeton) afficherSessions(); else afficherConnexion();
  }

  demarrer();
})();
