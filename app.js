(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const CLE_STOCKAGE = 'couture.session';
  const CLE_PUSH = 'couture.push';

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
  const ECRANS = ['sessions', 'gestion', 'reglages'];

  function afficherConnexion() {
    ECRANS.forEach((e) => { $('ecran-' + e).hidden = true; });
    $('onglets').hidden = true;
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

  const ROLES = { adherent: 'Adhérent·e', animatrice: 'Animatrice', bureau: 'Membre du bureau', admin: 'Administrateur' };

  function droits() {
    return (etat.utilisateur && etat.utilisateur.droits) || {};
  }

  function afficherProfil() {
    const u = etat.utilisateur || {};
    const groupe = u.groupe === 'Tous' ? ' · tous les groupes' : (u.groupe ? ` · groupe ${u.groupe}` : '');
    $('nom-utilisateur').textContent = ([u.prenom, u.nom].filter(Boolean).join(' ') || u.email || '') + groupe;
    $('onglet-gestion').hidden = !(droits().creerCours || droits().creerLibre);
  }

  function afficherSessions() {
    $('ecran-connexion').hidden = true;
    $('zone-compte').hidden = false;
    $('onglets').hidden = false;
    afficherProfil();
    afficherOnglet('sessions');
    afficherAideInstallation();
    initialiserPush();
    // Rôle et droits à jour (ils ont pu changer depuis la connexion)
    api('moi').then((r) => {
      if (!r.ok) return;
      etat.utilisateur = r.utilisateur;
      enregistrerSession();
      afficherProfil();
    });
  }

  function afficherOnglet(nom) {
    if (nom === 'gestion' && $('onglet-gestion').hidden) nom = 'sessions';
    ECRANS.forEach((e) => { $('ecran-' + e).hidden = e !== nom; });
    document.querySelectorAll('#onglets [data-onglet]').forEach((b) => {
      if (b.dataset.onglet === nom) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (nom === 'sessions') chargerSessions();
    if (nom === 'gestion') chargerGestion();
    if (nom === 'reglages') afficherReglages();
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
    const tokenPush = lirePush();
    if (tokenPush) await api('retirerAppareil', { tokenPush });
    ecrirePush(null);
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

  let sessionsParId = {};

  function rendreSessions(sessions) {
    sessionsParId = {};
    sessions.forEach((x) => { sessionsParId[x.id] = x; });
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
    const id = echapper(s.id);
    const cours = s.type === 'cours';
    const bouton = (act, libelle, classe, extra = '') =>
      `<button class="bouton ${classe}" data-action="${act}" data-id="${id}"${extra}>${libelle}</button>`;

    if (s.encadrant) {
      statut = `<span class="statut inscrit">${s.inscrit ? 'Vous encadrez ce cours' : 'Vous avez décliné ce cours'}</span>`;
      if (!s.inscrit && s.ouvert) action = bouton('inscrire', 'Je serai là finalement', 'secondaire');
    } else if (s.inscrit && cours && s.monGroupe) {
      statut = '<span class="statut inscrit">Vous êtes attendu·e</span>';
      action = bouton('desinscrire', 'Signaler mon absence', 'secondaire', ' data-cours="1"');
    } else if (s.inscrit) {
      statut = '<span class="statut inscrit">Vous êtes inscrit·e</span>';
      action = bouton('desinscrire', 'Me désinscrire', 'secondaire');
    } else if (!s.ouvert) {
      statut = `<span class="statut ferme">${s.absent ? 'Absence signalée' : 'Inscriptions fermées'}</span>`;
    } else if (s.complet && s.enAttente) {
      statut = '<span class="statut complet">Complet, vous serez prévenu·e si une place se libère</span>';
      action = bouton('quitterAttente', 'Ne plus être prévenu·e', 'secondaire');
    } else if (s.complet) {
      statut = `<span class="statut complet">${s.absent ? 'Absence signalée · complet' : 'Complet'}</span>`;
      action = bouton('rejoindreAttente', 'Me prévenir si une place se libère', 'secondaire');
    } else if (s.absent) {
      statut = '<span class="statut ferme">Absence signalée</span>';
      action = bouton('inscrire', 'Finalement, je viens', 'principal');
    } else if (cours && !s.monGroupe) {
      statut = '<span class="statut">Place disponible pour les autres groupes</span>';
      action = bouton('inscrire', 'Prendre la place', 'principal');
    } else {
      action = bouton('inscrire', 'M\'inscrire', 'principal');
    }

    const nomGroupe = s.groupe === 'Tous' ? ' · tous les groupes' : (s.groupe ? ' · groupe ' + echapper(s.groupe) : '');
    const badge = cours
      ? `<span class="badge cours">Cours${nomGroupe}${s.monGroupe && !s.encadrant && s.groupe !== 'Tous' ? ' · votre groupe' : ''}</span>`
      : '<span class="badge">Session libre</span>';
    const encadrement = cours && s.encadrants && s.encadrants.length && !s.encadrant
      ? `<p class="encadrement">Avec ${s.encadrants.map(echapper).join(', ')}</p>` : '';

    const fournitures = Array.isArray(s.fournitures) && s.fournitures.length
      ? `<div class="fournitures"><p class="fournitures-titre">À apporter</p><ul>${
          s.fournitures.map((f) => `<li>${echapper(f)}</li>`).join('')}</ul></div>`
      : '';
    const editionProgramme = s.programme
      ? `<button class="lien" type="button" data-action="programme" data-id="${id}">${
          s.programme.activite || s.programme.description || s.programme.fournitures
            ? 'Modifier le programme' : 'Saisir le programme'}</button>`
      : '';
    const annulation = s.peutAnnuler
      ? `<button class="lien lien-danger" type="button" data-action="annuler" data-id="${id}">${
          cours ? 'Annuler ce cours' : 'Annuler cette session'}</button>`
      : '';
    const liens = [editionProgramme, annulation].filter(Boolean).join('');
    const actions = action || liens
      ? `<div class="actions">${action}${liens ? `<div class="edition">${liens}</div>` : ''}</div>`
      : '';

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
      const absences = Array.isArray(s.absents) && s.absents.length
        ? `<p class="absences">Absent·es : ${s.absents.map(echapper).join(', ')}</p>` : '';
      blocInscrits = `<details class="inscrits"><summary>${s.nbInscrits} participant${s.nbInscrits > 1 ? 's' : ''} sur ${s.places} places</summary>${liste}${absences}</details>`;
    }

    return `
      <article class="session${s.inscrit ? ' inscrite' : ''}${cours ? ' cours' : ''}" aria-label="${echapper(s.titre)}, ${echapper(fmtComplet.format(debut))}">
        <div class="etiquette-date" aria-hidden="true">
          <span class="jour-semaine">${echapper(fmtJourSemaine.format(debut))}</span>
          <span class="jour">${echapper(fmtJour.format(debut))}</span>
          <span class="mois-court">${echapper(fmtMoisCourt.format(debut))}</span>
        </div>
        <div>
          ${badge}
          <h3>${echapper(s.titre)}</h3>
          <p class="infos">${heure(debut)} à ${heure(fin)}${s.lieu ? '<br>' + echapper(s.lieu) : ''}</p>
          ${encadrement}
          ${s.description ? `<p class="description">${echapper(s.description)}</p>` : ''}
          ${fournitures}
          ${statut}
        </div>
        ${actions}
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
    if (action === 'programme') {
      ouvrirProgramme(bouton.dataset.id);
      return;
    }
    if (action === 'annuler') {
      ouvrirAnnulation(bouton.dataset.id);
      return;
    }
    if (action === 'desinscrire') {
      const question = bouton.dataset.cours
        ? 'Signaler votre absence à ce cours ? Votre place pourra être prise par un adhérent de l\'autre groupe.'
        : 'Vous désinscrire de cette session ? Votre place sera proposée à d\'autres adhérents.';
      if (!window.confirm(question)) return;
    }
    occupe(bouton, true, LIBELLES_EN_COURS[action]);
    const r = await api(action, { eventId: bouton.dataset.id });
    occupe(bouton, false);
    if (r.code === 'AUTH') return;
    message(r.ok ? r.message : r.erreur, !r.ok);
    chargerSessions();
  }

  // ---------- Notifications push ----------
  function lirePush() {
    try { return localStorage.getItem(CLE_PUSH); } catch (e) { return null; }
  }

  function ecrirePush(token) {
    try {
      if (token) localStorage.setItem(CLE_PUSH, token); else localStorage.removeItem(CLE_PUSH);
    } catch (e) { /* ignoré */ }
  }

  function pushPossible() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window &&
      window.firebase && CFG.FIREBASE && CFG.FIREBASE.apiKey && CFG.VAPID_KEY;
  }

  // Minimisation : on n'enregistre que le type d'appareil, pas l'identification complète du navigateur.
  function typeAppareil() {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone / iPad';
    if (/android/i.test(ua)) return 'Android';
    return 'Autre';
  }

  function messagerie() {
    if (!firebase.apps.length) firebase.initializeApp(CFG.FIREBASE);
    return firebase.messaging();
  }

  async function obtenirTokenPush() {
    const reg = await navigator.serviceWorker.ready;
    return messagerie().getToken({ vapidKey: CFG.VAPID_KEY, serviceWorkerRegistration: reg });
  }

  let ecouteActive = false;
  function ecouterAuPremierPlan() {
    if (ecouteActive) return;
    ecouteActive = true;
    // Appli ouverte : pas de notification système, on affiche un message et on actualise.
    messagerie().onMessage((p) => {
      message((p.notification && p.notification.body) || 'Une place s\'est libérée.');
      chargerSessions();
    });
  }

  // Au démarrage : si déjà autorisé, vérifie que l'identifiant n'a pas changé.
  async function initialiserPush() {
    afficherZoneNotifications();
    if (!pushPossible() || Notification.permission !== 'granted' || !lirePush()) return;
    try {
      const token = await obtenirTokenPush();
      ecouterAuPremierPlan();
      if (token && token !== lirePush()) {
        const r = await api('enregistrerAppareil', { tokenPush: token, appareil: typeAppareil() });
        if (r.ok) ecrirePush(token);
      }
    } catch (e) { /* hors ligne ou service indisponible : on réessaiera au prochain lancement */ }
  }

  async function activerNotifications(bouton) {
    occupe(bouton, true, 'Activation…');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        message('Notifications refusées. Vous pouvez les autoriser dans les réglages de l\'application.', true);
        return;
      }
      const token = await obtenirTokenPush();
      const r = await api('enregistrerAppareil', { tokenPush: token, appareil: typeAppareil() });
      if (!r.ok) { message(r.erreur, true); return; }
      ecrirePush(token);
      ecouterAuPremierPlan();
      message(r.message);
    } catch (e) {
      message('Impossible d\'activer les notifications sur cet appareil.', true);
    } finally {
      afficherZoneNotifications();
      if (!$('ecran-reglages').hidden) afficherReglages();
    }
  }

  function htmlEtatPush() {
    if (!pushPossible()) {
      return { visible: false, html: 'Les notifications ne sont pas disponibles sur ce navigateur' +
        (/iphone|ipad|ipod/i.test(navigator.userAgent) ? ' (sur iPhone : installez d\'abord l\'application sur l\'écran d\'accueil).' : '.') +
        ' Vous recevez les alertes par e-mail.' };
    }
    if (Notification.permission === 'denied') {
      return { visible: true, html: 'Les notifications sont bloquées pour cette application. ' +
        'Autorisez-les dans les réglages du téléphone.' };
    }
    if (Notification.permission === 'granted' && lirePush()) {
      return { visible: false, html: 'Activées sur ce téléphone.' };
    }
    return { visible: true, html: 'Recevez une notification sur ce téléphone : place libérée, rappel, ' +
      'programme d\'un cours, inscriptions. ' +
      '<button class="lien btn-activer-push" type="button">Activer les notifications</button>' };
  }

  function afficherZoneNotifications() {
    const etatPush = htmlEtatPush();
    const zone = $('zone-notifications');
    zone.innerHTML = etatPush.html;
    zone.hidden = !etatPush.visible;
    $('reglages-push').innerHTML = `<p>${etatPush.html}</p>`;
  }

  // ---------- Programme des cours (animatrices) ----------
  let programmeEnCours = null;

  function ouvrirProgramme(id) {
    const s = sessionsParId[id];
    if (!s || !s.programme) return;
    programmeEnCours = id;
    $('programme-date').textContent =
      fmtComplet.format(new Date(s.debut)) + (s.groupe ? ` · groupe ${s.groupe}` : '');
    $('prog-activite').value = s.programme.activite || '';
    $('prog-description').value = s.programme.description || '';
    $('prog-fournitures').value = s.programme.fournitures || '';
    const d = $('dialogue-programme');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    $('prog-activite').focus();
  }

  function fermerProgramme() {
    const d = $('dialogue-programme');
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    programmeEnCours = null;
  }

  async function enregistrerProgramme(e) {
    e.preventDefault();
    if (!programmeEnCours) return;
    const bouton = $('prog-enregistrer');
    if (bouton.disabled) return;
    occupe(bouton, true, 'Enregistrement…');
    const r = await api('modifierProgramme', {
      eventId: programmeEnCours,
      programme: {
        activite: $('prog-activite').value,
        description: $('prog-description').value,
        fournitures: $('prog-fournitures').value
      }
    });
    occupe(bouton, false);
    if (r.code === 'AUTH') { fermerProgramme(); return; }
    if (!r.ok) { message(r.erreur, true); return; }
    fermerProgramme();
    message(r.message);
    chargerSessions();
  }

  // ---------- Gestion (animatrices, bureau, admin) ----------
  const fmtDateCourte = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
  const libelleDate = (iso) => fmtDateCourte.format(new Date(iso + 'T12:00:00Z'));
  let gestionInitialisee = false;

  async function chargerGestion() {
    const r = await api('gestion');
    if (!r.ok) { if (r.code !== 'AUTH') message(r.erreur, true); return; }
    const d = droits();
    $('bloc-absences').hidden = !d.creerCours;
    $('bloc-cours').hidden = !d.creerCours;
    $('bloc-session').hidden = !d.creerLibre;

    if (!gestionInitialisee) {
      $('cours-groupe').innerHTML = r.groupes.map((g) =>
        `<option value="${echapper(g)}">${g === 'Tous' ? 'Tous les groupes' : 'Groupe ' + echapper(g)}</option>`).join('');
      $('cours-heure').value = r.defauts.heureCours;
      $('cours-duree').value = r.defauts.dureeCours;
      $('cours-lieu').value = r.defauts.lieuCours;
      $('session-heure').value = r.defauts.heureLibre;
      $('session-duree').value = r.defauts.dureeLibre;
      $('session-lieu').value = r.defauts.lieuLibre;
      $('session-places').value = r.defauts.placesLibre;
      gestionInitialisee = true;
    }

    const liste = $('liste-absences');
    const absences = r.absences || [];
    liste.innerHTML = absences.length
      ? absences.map((a, i) => `<li><span><strong>${a.debut === a.fin ? 'Le ' + echapper(libelleDate(a.debut))
          : 'Du ' + echapper(libelleDate(a.debut)) + ' au ' + echapper(libelleDate(a.fin))}</strong>${
          a.motif ? ' — ' + echapper(a.motif) : ''}</span>
          <button class="lien lien-danger" type="button" data-absence="${i}">Supprimer</button></li>`).join('')
      : '<li class="vide-liste">Aucune absence à venir.</li>';
    liste.dataset.absences = JSON.stringify(absences);

    const lien = $('lien-formulaire');
    if (r.formulaire && d.creerCours) {
      lien.innerHTML = `Vous pouvez aussi utiliser le <a href="${echapper(r.formulaire)}" target="_blank" rel="noopener">formulaire Google des cours</a>.`;
      lien.hidden = false;
    } else {
      lien.hidden = true;
    }
  }

  async function soumettre(e, action, cle, donnees, apres) {
    e.preventDefault();
    const bouton = e.target.querySelector('button[type=submit]');
    if (bouton.disabled) return;
    occupe(bouton, true, 'Enregistrement…');
    const r = await api(action, { [cle]: donnees });
    occupe(bouton, false);
    if (r.code === 'AUTH') return;
    message(r.ok ? r.message : r.erreur, !r.ok);
    if (r.ok && apres) apres();
  }

  function initialiserGestion() {
    $('form-absence').addEventListener('submit', (e) => soumettre(e, 'ajouterAbsence', 'absence', {
      debut: $('abs-debut').value, fin: $('abs-fin').value, motif: $('abs-motif').value
    }, () => { $('form-absence').reset(); chargerGestion(); }));

    $('form-cours').addEventListener('submit', (e) => soumettre(e, 'creerCours', 'cours', {
      date: $('cours-date').value, heure: $('cours-heure').value, duree: $('cours-duree').value,
      groupe: $('cours-groupe').value, places: $('cours-places').value, lieu: $('cours-lieu').value,
      programme: {
        activite: $('cours-activite').value, description: $('cours-description').value,
        fournitures: $('cours-fournitures').value
      }
    }, () => {
      ['cours-date', 'cours-places', 'cours-activite', 'cours-description', 'cours-fournitures']
        .forEach((id) => { $(id).value = ''; });
    }));

    $('form-session').addEventListener('submit', (e) => soumettre(e, 'creerSession', 'session', {
      date: $('session-date').value, heure: $('session-heure').value, duree: $('session-duree').value,
      places: $('session-places').value, titre: $('session-titre').value, lieu: $('session-lieu').value,
      description: $('session-description').value
    }, () => {
      ['session-date', 'session-titre', 'session-description'].forEach((id) => { $(id).value = ''; });
    }));

    $('liste-absences').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-absence]');
      if (!b) return;
      const a = JSON.parse($('liste-absences').dataset.absences || '[]')[Number(b.dataset.absence)];
      if (!a || !window.confirm('Supprimer cette absence ? Les cours de cette période seront recréés et les groupes invités.')) return;
      occupe(b, true, 'Suppression…');
      const r = await api('supprimerAbsence', { absence: a });
      occupe(b, false);
      if (r.code === 'AUTH') return;
      message(r.ok ? r.message : r.erreur, !r.ok);
      if (r.ok) chargerGestion();
    });
  }

  // ---------- Annulation d'un cours ou d'une session ----------
  let annulationEnCours = null;

  function ouvrirAnnulation(id) {
    const s = sessionsParId[id];
    if (!s) return;
    annulationEnCours = id;
    const cours = s.type === 'cours';
    $('titre-annulation').textContent = cours ? 'Annuler le cours' : 'Annuler la session';
    $('annulation-confirmer').textContent = cours ? 'Annuler le cours' : 'Annuler la session';
    $('annulation-date').textContent = `${s.titre} · ${fmtComplet.format(new Date(s.debut))}`;
    $('annulation-motif').value = '';
    const d = $('dialogue-annulation');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    $('annulation-motif').focus();
  }

  function fermerAnnulation() {
    const d = $('dialogue-annulation');
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    annulationEnCours = null;
  }

  async function confirmerAnnulation(e) {
    e.preventDefault();
    if (!annulationEnCours) return;
    const bouton = $('annulation-confirmer');
    if (bouton.disabled) return;
    occupe(bouton, true, 'Annulation…');
    const r = await api('annuler', { eventId: annulationEnCours, motif: $('annulation-motif').value });
    occupe(bouton, false);
    if (r.code === 'AUTH') { fermerAnnulation(); return; }
    if (!r.ok) { message(r.erreur, true); return; }
    fermerAnnulation();
    message(r.message);
    chargerSessions();
  }

  // ---------- Réglages ----------
  const TEXTES_PERIMETRE = {
    mes: 'Me prévenir quand quelqu\'un s\'inscrit ou se désinscrit d\'une séance où je suis inscrit·e',
    cours: 'Me prévenir quand quelqu\'un s\'inscrit ou se désinscrit d\'un cours',
    tout: 'Me prévenir quand quelqu\'un s\'inscrit ou se désinscrit d\'un cours ou d\'une session libre'
  };

  function afficherReglages() {
    const u = etat.utilisateur || {};
    const d = droits();
    const groupe = u.groupe === 'Tous' ? 'tous les groupes' : (u.groupe ? 'groupe ' + u.groupe : 'sans groupe');
    $('reglages-compte').textContent =
      `${[u.prenom, u.nom].filter(Boolean).join(' ')} · ${ROLES[u.role] || u.role || ''} · ${groupe}\n${u.email || ''}`;
    afficherZoneNotifications();

    const bloc = $('bloc-notif-inscriptions');
    if (!d.notifInscriptions || d.notifInscriptions === 'jamais') { bloc.hidden = true; return; }
    bloc.hidden = false;
    const caseNotif = $('notif-inscriptions');
    caseNotif.checked = !!u.notifInscriptions;
    caseNotif.disabled = d.notifInscriptions === 'toujours';
    $('notif-inscriptions-texte').textContent = TEXTES_PERIMETRE[d.perimetreNotif] || TEXTES_PERIMETRE.mes;
    const pushActif = pushPossible() && Notification.permission === 'granted' && lirePush();
    $('notif-inscriptions-aide').textContent = d.notifInscriptions === 'toujours'
      ? 'Toujours activé pour votre rôle' + (pushActif ? '.' : ' : sans notification sur ce téléphone, vous les recevez par e-mail.')
      : (pushActif ? 'Les alertes arrivent en notification sur ce téléphone.'
                   : 'Activez les notifications sur ce téléphone pour les recevoir.');
  }

  async function changerNotifInscriptions(e) {
    const caseNotif = e.target;
    caseNotif.disabled = true;
    const r = await api('reglages', { reglages: { notifInscriptions: caseNotif.checked } });
    caseNotif.disabled = false;
    if (r.code === 'AUTH') return;
    if (!r.ok) { caseNotif.checked = !caseNotif.checked; message(r.erreur, true); return; }
    etat.utilisateur = r.utilisateur;
    enregistrerSession();
    message(r.message);
    afficherReglages();
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
    $('onglets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-onglet]');
      if (b) afficherOnglet(b.dataset.onglet);
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.btn-activer-push');
      if (b) activerNotifications(b);
    });
    initialiserGestion();
    $('notif-inscriptions').addEventListener('change', changerNotifInscriptions);
    $('form-annulation').addEventListener('submit', confirmerAnnulation);
    $('annulation-retour').addEventListener('click', fermerAnnulation);
    $('dialogue-annulation').addEventListener('close', () => { annulationEnCours = null; });
    $('liste-sessions').addEventListener('click', surClicListe);
    $('form-programme').addEventListener('submit', enregistrerProgramme);
    $('prog-annuler').addEventListener('click', fermerProgramme);
    $('dialogue-programme').addEventListener('close', () => { programmeEnCours = null; });

    // Actualise quand on revient dans l'application
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && etat.jeton && !$('ecran-sessions').hidden) chargerSessions();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* fonctionne aussi sans */ });
    }

    // Demande au navigateur de ne pas effacer les données de l'appli en cas de manque d'espace
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    chargerSession();
    if (etat.jeton) afficherSessions(); else afficherConnexion();
  }

  demarrer();
})();
