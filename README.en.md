# Lullaby Lake

**A dreaming lake, a cabin, all the time in the world.** A zen fishing game in the browser, in "HD-2D": pixel-art characters walking through a small 3D world, with its lights, shadows, grass and water.

### ▶ [Play Lullaby Lake](https://malikchopa.github.io/lullaby-lake/)

*In the browser: no install, no account, no ads, no purchases. On a phone, in landscape.*  ·  [Version française](README.md)

![The pier at dusk: the line is in the water, the cat waits nearby, the islet in the distance](docs/media/lac.png)

| | |
|---|---|
| ![The village square at dusk: the shop, the well, Mme Ondine's stall](docs/media/village.png) | ![Inside the cabin: the stove, the bed, the desk with the letters](docs/media/interieur.png) |

*(The screenshots show the French interface; the game also plays in English.)*

## The story: *Lullaby of the Lake* (*La Berceuse du lac*)

You inherit your grandmother's cabin on the shore of a lake. She used to sing there every evening. They say a spirit sleeps at the bottom of the water and the fish are its dreams. By fishing, talking to the villagers and reading the letters left in the cabin, you slowly find **the 8 verses of the lullaby**; each one makes the lake a little more alive. The ending is gentle. Nothing in it is scary.

## What is it?

- **Zen fishing, no defeat.** You progress (gear, spots around the lake, story); you never lose anything. No score, no pressing timer.
- **Walk the world**: the cabin and its pier, the village (the shop, the workshop, four houses), the reed shallows, the pine forest, then the boat to the deep water and an islet.
- **Step inside**: every building has its own small room, with the people who live there.
- **24 fish** to collect, plus **8 dream fish** tied to the story. Each has its hours, weather and spot; the journal gives hints.
- **A little challenge, never a punishment**: sell your duplicate fish (optional), buy better gear at the shop, orders with no deadline, a short tussle when a fish bites (miss it and the fish swims off, nothing is lost; an "Automatic fight" option exists). Gear wears a little and is repaired at the workshop; it never breaks for good.
- **A living lake**: day, dusk, night, dawn; sun, clouds, rain, mist; the cabin cat.
- **Music**: by default 3 lofi tracks by omfgdude, free to use (CC0); or a "Soft" music made by code. Everything can be played **without sound**.
- **Offline**: after a first visit, the game starts without a network.
- **Your save stays in your browser**, no account; nothing is sent anywhere.
- **Photo mode**: a PNG picture of the view, without the interface.
- **French and English.**

## Controls

| | Keyboard | Mouse | Touch |
|---|---|---|---|
| Walk | arrows, or W A S D (QWERTY) / Z Q S D (AZERTY) | click a place | thumb on the left half (small joystick), or tap a place |
| Cast the line | hold Space or Enter, release | "Fish" button | "Fish" button |
| Reel in when it bites | Space or Enter | "Fish" button | "Fish" button |
| Talk, enter, use | Enter near the person or the door | action button | action button, or tap the door |
| Turn the view a quarter turn | Q / E (QWERTY), A / E (AZERTY) | — | ⟲ ⟳ buttons |
| Zoom | — | wheel | two fingers |
| Journal · orders · bag · photo · settings | C · O · B · P · R | menu at the top right | menu at the top right |
| Mute | M | settings | settings |
| Close a panel | Escape | ✕ button | ✕ button |

The walking and view keys are read by their place on the keyboard, whatever its layout. The one-letter shortcuts can be turned off in the settings.

## Accessibility (what is really there)

- **Nothing rushes you**: no countdown; "Let the fish wait" and "Automatic fight" in the settings.
- **Reduced motion** (also follows the system setting), **three text sizes**, **quiet interface**.
- **Nothing relies on colour or sound alone**: the bite, the tussle and the wear are also shown in words and shapes.
- **The whole game by keyboard**, also by mouse and touch; important messages are placed in areas read by screen readers.

## Play locally

The repository holds the game as is, with no build step. Run any static file server at the root of the repository, for example:

```
python -m http.server 8000
```

then open `http://localhost:8000/refonte/`. You need a browser that can show 3D (WebGL 2); otherwise the game says so.

## What is not verified

The game was tried by automated scripts in Chrome on a single Windows PC (keyboard, mouse, emulated touch, offline, saving). Everything else is **not verified**:

- **real phones**: only Chrome's emulation on a desktop PC;
- **Safari and Firefox** (so Mac and iPhone too): not tried;
- **screen readers** (NVDA, VoiceOver…): not tried;
- **the English texts**: not proofread by a native speaker;
- **the music and the ending of the story**: never listened to or played through by a person;
- **timings and smoothness**: measured on one fast PC only; they say nothing about an average phone.

## Credits

A game by MalikChopa.

- 3D: [three.js](https://threejs.org/) (MIT), copied into `vendor/` (no CDN).
- 3D scenery models: [Kenney](https://www.kenney.nl/) (CC0), lightened and recoloured; the water, grass, light, characters and fish are made by code.
- Music: omfgdude (CC0, OpenGameArt).
- Font: [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) (SIL OFL 1.1).

The game was designed and programmed with the help of Claude (Anthropic), an artificial-intelligence assistant; the art direction and the decisions are the author's.

## Licences

- **Code**: [MIT](LICENSE).
- **Art and sounds** made for the game: [CC BY 4.0](LICENSE-ART), © MalikChopa. If you reuse them, credit: "Lullaby Lake — © MalikChopa, CC BY 4.0, https://creativecommons.org/licenses/by/4.0/".
- **Third-party material** (three.js, font, 3D models, music): see [THIRD-PARTY](THIRD-PARTY) and [the model credits](refonte/assets/models/CREDITS.txt).
