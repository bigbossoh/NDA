# Fiche de souscription · Paroisse Notre-Dame de l'Assomption

Site statique (HTML + Tailwind CSS) pour collecter en ligne les fiches de souscription
de l'Année du Consacré 2026-2027, avec un espace administrateur.

- `index.html` : formulaire public (nom, prénoms, sexe, contact, lieu d'habitation,
  emploi/profession, fonction, statut actuel, montant souscrit). Chaque fiche reçoit
  un numéro unique `N° EC-DGB-PNDA-AP-2026_2027/ FS000001` et peut être imprimée.
- `admin.html` : connexion administrateur + tableau de bord (personnes en ligne,
  visites, souscripteurs, femmes, hommes, montants, graphiques, liste, export CSV).

Les données sont stockées dans **Firebase** (gratuit), car GitHub Pages ne fournit
pas de serveur. Sans configuration Firebase, le site fonctionne en **mode démo**
(données dans le navigateur uniquement, mot de passe admin : `admin`).

## 1. Configurer Firebase (≈ 10 minutes)

1. Aller sur <https://console.firebase.google.com> et créer un projet.
2. **Firestore Database** > Créer une base de données (mode production, région `eur3` ou proche).
3. Onglet **Règles** : coller le contenu de `firestore.rules`, puis **Publier**.
4. **Authentication** > Commencer > activer **Adresse e-mail/Mot de passe**.
5. Authentication > Utilisateurs > **Ajouter un utilisateur** (e-mail + mot de passe de l'administrateur).
   Copier son **UID**.
6. Firestore > **Démarrer une collection** nommée `admins`, ID du document = l'UID copié,
   avec un champ quelconque (ex. `role` = `admin`). Répéter pour chaque administrateur.
7. Paramètres du projet (⚙️) > **Vos applications** > icône Web `</>` > enregistrer l'application,
   puis copier l'objet `firebaseConfig` dans `js/firebase-config.js`.
8. Authentication > Paramètres > **Domaines autorisés** : ajouter `VOTRE_PSEUDO.github.io`.

> Les clés de `firebase-config.js` ne sont pas secrètes : la sécurité repose sur
> `firestore.rules` (seuls les comptes listés dans `admins` peuvent lire les fiches).

## 2. Publier sur GitHub Pages

```bash
git init
git add .
git commit -m "Site de souscription NDA"
git branch -M main
git remote add origin https://github.com/VOTRE_PSEUDO/souscription-nda.git
git push -u origin main
```

Puis sur GitHub : **Settings > Pages > Source : Deploy from a branch > `main` / `root`**.
Le site sera accessible à `https://VOTRE_PSEUDO.github.io/souscription-nda/`
et l'administration à `.../souscription-nda/admin.html`.

## Tester en local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Les modules JavaScript ne se chargent pas en ouvrant le fichier directement par double-clic.)
