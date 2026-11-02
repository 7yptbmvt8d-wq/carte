# Ma Collection DBS

Application web installable (PWA) pour gérer une collection de cartes **Dragon Ball Super Card Game** (Fusion World et Masters).

## Fonctions

- **Ajout par numéro** : `FB01-001`, `BT1-031`, `P-123`, `fb01 001`… (recherche par nom possible). Toutes les versions (alternate art, promo…) sont proposées avec leur illustration.
- **Scan** : photo de la carte → lecture automatique du numéro (OCR Tesseract, dans le navigateur). La photo peut servir d'illustration.
- **Valeur de marché** : prix TCGplayer (marché / plus bas / médian), convertis en € au taux BCE. Prix manuel possible (ex. Cardmarket).
- **Suivi** : graphique de la valeur totale et par carte (1M / 3M / 6M / 1A / Tout), hausses et baisses, plus-value sur prix d'achat.
- Quantité, état, langue, date et prix d'achat, notes, photo perso.
- Filtres et tris (valeur, variation, plus-value, numéro, ajout).
- Export / import JSON (sauvegarde complète, photos incluses) et export CSV (Excel).
- Fonctionne hors connexion après la première ouverture.

La collection reste **sur l'appareil** (localStorage + IndexedDB) : exporter régulièrement.

## Données

`scripts/build-data.mjs` télécharge chaque jour, depuis [tcgcsv.com](https://tcgcsv.com) (miroir des données TCGplayer), la liste des cartes, les illustrations et les prix. Un instantané hebdomadaire des prix est conservé dans `public/data/history/` : il alimente les graphiques, y compris pour une carte ajoutée récemment. L'app complète avec un point local à chaque mise à jour.

## Mise en ligne (GitHub Pages)

1. Fusionner sur `main`.
2. Dépôt → *Settings* → *Pages* → *Source* : **GitHub Actions**.
3. Le workflow `Prix & déploiement` publie l'app et met à jour les prix chaque soir.
4. Sur le téléphone : ouvrir l'URL Pages → *Partager* → *Sur l'écran d'accueil* (iOS) ou *Installer l'application* (Android).

GitHub Pages sur un dépôt privé nécessite un abonnement GitHub payant ; sinon rendre le dépôt public (la collection, elle, n'est jamais publiée).

## En local

```bash
npm start   # télécharge les données puis sert l'app sur http://localhost:8080
```
