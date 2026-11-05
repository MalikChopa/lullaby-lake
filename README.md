# Lullaby Lake

**Un lac, une canne, tout le temps du monde.** Un petit jeu de pêche zen dans le navigateur, en pixel art : on regarde, on respire, on remplit son carnet de pêche.

[English version](README.en.md)

![Lullaby Lake : un pêcheur sur un ponton au crépuscule, une touche, une perche ambrée dans le carnet, puis le lac sous la pluie de nuit](docs/media/lullaby-lake.gif)

*Le GIF est un montage de deux enregistrements réels du jeu (le crépuscule, puis un moment de nuit et de pluie), sans son.*

## C'est quoi ?

- **Pêche zen, sans victoire.** Pas de score, pas de défaite, rien ne se perd. On lance la ligne, on attend, on remonte, on remet le poisson à l'eau ou on admire sa fiche.
- **24 poissons à collectionner**, dessinés pour le jeu. Chacun a ses heures et sa météo : certains sortent surtout la nuit, ou plutôt sous la pluie. Le carnet donne un indice pour les trouver.
- **Un lac vivant** : jour, crépuscule, nuit et aube qui se fondent doucement (une journée dure 8 minutes), soleil, lune, étoiles, nuages, pluie et brume.
- **Un lac habité** : un chat qui s'étire, bâille et s'endort la nuit, des oiseaux qui passent de temps en temps (héron, oies, hibou), une grenouille, des libellules, des poissons qui sautent au loin, une chauve-souris au crépuscule, une étoile filante rare par ciel dégagé. Tout est silencieux et discret, et reste immobile avec « mouvement réduit ».
- **Un son presque tout fabriqué par le code** (Web Audio : eau, vent, pluie, grillons, oiseaux, et deux styles de musique générés : douce ou lofi). Un troisième style, « Vrais morceaux lofi », joue **3 morceaux enregistrés** de l'auteur omfgdude, libres de droits (CC0, voir `THIRD-PARTY`) ; ils ne sont chargés que si tu choisis ce style. Le son démarre seulement après « Commencer » ; on peut jouer sans le son.
- **Pas de chrono qui presse.** Une seule exception, voulue : quand un poisson mord, il repart doucement après 8 secondes puis revient plus tard (le même poisson, rien n'est perdu, aucun compte à rebours à l'écran). Une option des réglages, « Laisser le poisson attendre », supprime cette limite.
- **Ta partie est gardée dans ton navigateur** (carnet, réglages), sans compte et sans rien envoyer nulle part.
- **Mode photo** : une image PNG de 1920 × 1080 du lac, sans l'interface.
- **Hors ligne** après le premier chargement (service worker). Les 3 morceaux enregistrés ne sont pas dans ce premier chargement : un morceau marche hors ligne une fois écouté.
- **Français et anglais.**

## Captures

| Crépuscule | Nuit et pluie | Carnet de pêche |
|---|---|---|
| ![Le lac au crépuscule](docs/media/screen-dusk.jpg) | ![Le lac de nuit sous la pluie](docs/media/screen-night-rain.jpg) | ![Le carnet de pêche à moitié rempli](docs/media/screen-book.jpg) |

## Jouer

**En ligne** : pas encore publié. <à compléter après publication>

**En local** (il faut [Node.js](https://nodejs.org/) 22 ou plus récent ; testé avec Node 22.14 ; aucune installation de paquet, `npm install` n'est pas nécessaire) :

```
node tools/serve.mjs
```

Puis ouvre dans ton navigateur l'adresse affichée dans le terminal (en général `http://127.0.0.1:4183/`). Un petit serveur est nécessaire parce que les navigateurs refusent de charger les modules JavaScript depuis un fichier ouvert directement (`file://`). Ce serveur n'écoute que ton ordinateur (`127.0.0.1`).

Au premier écran : **Commencer** (avec le son) ou **Sans le son**. Ensuite, **maintiens** le bouton de la souris (ou ton doigt, ou Espace) pour lancer, **relâche** pour envoyer la ligne. Quand ça mord, **appuie une fois** pour remonter.

## Commandes

| | Souris / tactile | Clavier |
|---|---|---|
| Lancer | maintenir sur la scène, relâcher | maintenir Espace ou Entrée, relâcher |
| Remonter (quand ça mord) | appuyer sur la scène | Espace ou Entrée |
| Carnet de pêche | bouton « livre » en haut à droite | `C` |
| Réglages (langue, taille du texte, volumes, …) | bouton « haut-parleur » | `R` |
| Mode photo | bouton « appareil photo » | `P` |
| Couper / remettre le son | case dans les réglages | `M` |
| Fermer un panneau | bouton ✕ | `Échap` |

Les raccourcis clavier `C`, `R`, `P`, `M` peuvent être désactivés dans les réglages. Sur téléphone, le jeu se joue **en paysage** : en portrait, un message demande de tourner l'appareil.

## Accessibilité (ce qui est réellement là)

- **Mouvement réduit** : option dans les réglages (et le jeu suit aussi le réglage du système).
- **Taille du texte** : trois tailles (normal, grand, très grand).
- **Rien n'est porté par la couleur ou le son seul** : la touche s'annonce par un texte et un « ! » ; la rareté d'un poisson est écrite en toutes lettres en plus des pastilles ; les changements de moment et de météo s'écrivent à l'écran.
- **Clavier** : on peut lancer, remonter, parcourir le carnet (flèches) et régler le jeu sans souris ; vérifié par des scripts dans Chrome, pas par une personne qui joue au clavier.
- **Pas de limite de temps** possible avec « Laisser le poisson attendre ».
- **Sans le son** : le jeu est complet sans son, et le son ne démarre qu'après ton premier geste.

Les lecteurs d'écran n'ont **pas** été essayés (voir plus bas).

## Technique

- JavaScript (modules ES), sans étape de build : le site est fait de fichiers servis tels quels.
- [PixiJS](https://pixijs.com/) 8.22.0 pour l'affichage, copié dans `vendor/` (aucun CDN, aucun réseau au lancement).
- Le décor, le pêcheur, l'eau, la pluie et les poissons sont **peints par le code** à une résolution de 480 × 270 pixels, agrandie en pixels nets. Les poissons, les ambiances et les textes sont dans des fichiers de données (`src/data/`) : ajouter une espèce ne touche pas au cœur du jeu.
- Le cœur du jeu (`src/core/`) ne dépend ni du navigateur ni de l'affichage, ce qui permet de le tester sans navigateur.
- Son : Web Audio. L'ambiance, les effets et les styles de musique « Douce » et « Lofi » sont synthétisés. Le style « Vrais morceaux lofi » lit 3 fichiers enregistrés (`assets/music/`, 6,5 Mo, CC0 : voir `THIRD-PARTY`), chargés seulement à la demande et gardés par le service worker après la première écoute.
- Tests : `npm test` (le lanceur de tests intégré à Node, sans dépendance ; plus de 250 tests : tirage des poissons, sauvegarde, jour/nuit, textes FR/EN, service worker, absence d'accès réseau…).
- Après avoir modifié un fichier du site, `npm run sw` met à jour la liste de fichiers du mode hors ligne (le test du service worker échoue sinon).
- Poids du jeu au premier chargement : environ 381 Kio une fois tous les fichiers compressés (mesuré en compressant l'ensemble le 2026-11-05 ; les 3 morceaux de musique, 6,5 Mo, n'en font pas partie).

## Ce qui est vérifié, ce qui ne l'est pas

Le jeu a été essayé **par des scripts automatiques dans Chrome sur un PC Windows** (clic, clavier, tactile émulé, perte du contexte graphique, hors ligne, sauvegarde après fermeture du navigateur…). Tout le reste est écrit tel quel : « non vérifié ».

| | Windows | Mac | iPhone | Android |
|---|---|---|---|---|
| Chrome | testé (version 156) | non vérifié | non vérifié | non vérifié |
| Edge | testé (version 156, avec les mêmes scripts que Chrome) | non vérifié | — | — |
| Firefox | non vérifié | non vérifié | — | non vérifié |
| Safari | — | non vérifié | non vérifié | — |

Aussi **non vérifié** :

- **le téléphone** : aucun vrai téléphone n'a été essayé, seulement l'émulation tactile de Chrome. Le son sur iPhone (bouton silencieux, reprise après l'arrière-plan) n'est pas vérifié ;
- **la fluidité** : mesurée sur un seul PC, très puissant. Rien n'est mesuré sur un téléphone ou un ordinateur modeste ;
- **les lecteurs d'écran** (NVDA, VoiceOver…) : le jeu annonce les changements dans une zone prévue pour eux, mais aucun lecteur d'écran n'a été essayé ;
- **l'anglais** : les textes anglais ont été écrits sans relecture par un anglophone ;
- **« un inconnu lance sa première ligne en moins de 10 secondes sans rien lire »** : non vérifié par un humain. Un script suit le chemin le plus court (2 interactions, quelques secondes), ce qui ne prouve pas qu'un visiteur y arrive sans hésiter ;
- **le ressenti** : le rythme (le carnet complet est estimé à environ 2 h 20 par une simulation, pas par des parties jouées), la qualité du son et le départ du poisson après 8 secondes n'ont pas été jugés par de vrais joueurs ;
- la navigation privée réelle, la boîte « Enregistrer sous » de la photo, la rotation d'écran verrouillée.

## Licences

- **Code** : [MIT](LICENSE).
- **Dessins** (les poissons, les captures et le GIF de ce dépôt, les photos exportées par le jeu) : [CC BY 4.0](LICENSE-ART). Si tu les réutilises, cite : « Lullaby Lake — dessins © MalikChopa, CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ ».
- **Éléments tiers** (PixiJS, police Pixelify Sans, …) : voir [THIRD-PARTY](THIRD-PARTY).

## Crédits

Un jeu de MalikChopa. Police [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) (SIL OFL 1.1). Affichage : [PixiJS](https://pixijs.com/) (MIT). Le jeu a été conçu et programmé avec l'aide de Claude (Anthropic), un assistant d'intelligence artificielle ; la direction artistique et les décisions sont celles de l'auteur.
