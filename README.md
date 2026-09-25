# Ruzzle 24h

Jeu de mots façon Ruzzle, en français, en PWA pour iPhone. Une nouvelle grille 4×4 chaque jour à minuit : le but est de trouver **tous** les mots en 24h.

- Règles Ruzzle : lettres voisines (diagonales comprises), 2 lettres minimum, bonus LD/LT/MD/MT, +5 pts par lettre au-delà de 4.
- Grille générée à partir de la date : pas de serveur, tout est stocké sur l'appareil.
- Solution de la veille consultable depuis l'accueil.

## Installer sur iPhone

Ouvrir l'URL GitHub Pages dans **Safari** → bouton Partager → « Sur l'écran d'accueil ».

## Développement

Aucun build. Servir le dossier :

```bash
python3 -m http.server 8765
```

Après une modification, incrémenter `VERSION` dans `sw.js` pour forcer la mise à jour du cache.

Le dictionnaire `words.txt` est généré par `tools/build_dict.py` à partir de la liste de Christophe Pallier (pallier.org).
