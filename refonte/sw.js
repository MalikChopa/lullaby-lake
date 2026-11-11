// Lullaby Lake HD-2D service worker (brief 34): keeps the whole HD-2D game in one cache so it starts without a network after the first visit.
// Same principles as the 2D game's worker (../sw.js), with its own name and its own scope:
// - scope: this folder (refonte/). The page asks for files of the 2D game (in ../src/), three.js (in ../vendor/three/), the font and the music
//   (in ../assets/music/): a worker sees every request of the pages it controls, so they are cached here too, in this worker's own cache.
// - install: stores every file of FILES (asked again from the server, never from an old HTTP cache) in the cache of this VERSION.
// - fetch: same-origin GET only, cache first; a page address (also with ?debug=1 or any query) falls back on ./index.html (the HD-2D page);
//   a file missing from the cache goes to the network once (the only network call of this file).
// - the three recorded music tracks (MUSIC) are NOT stored at install (6.5 MB: the first visit stays smaller). They are stored the first time
//   they are asked for AND answered in full (status 200, not a page, no Range header), in the same versioned cache, then served from it (offline
//   too). Nothing else can be stored at run time: the list is data, matched on the exact address (no query). A Range request is answered with a
//   correct 206/416 from the cached copy; a Range request on a track that is not cached goes to the network and is not stored.
// - a request never re-creates a deleted cache (?nosw=1 deletes it while the page still runs under this worker): it then simply goes to the network.
// - activate: deletes the OLD caches of THIS game only (names starting with "lullaby-hd2d-"). The 2D game's caches ("lullaby-lake-...") are
//   never touched, and the 2D game's worker never touches these ("lullaby-hd2d-..." does not start with "lullaby-lake-").
//   No skipWaiting, no claim: a new version starts at the NEXT launch, never in the middle of a game.
// FILES, MUSIC and VERSION are written by `node tools/site-files.mjs --refonte --write` (npm run sw:refonte); tests/refonte-offline.test.js fails
// if they are stale. Nothing is ever sent anywhere and no other site is contacted.

const VERSION = '9017850960e4';
// BEGIN FILES (written by tools/site-files.mjs --refonte --write; tests/refonte-offline.test.js checks it)
const FILES = [
  './',
  './assets/models/axe.glb',
  './assets/models/banner.glb',
  './assets/models/barrel.glb',
  './assets/models/bedroll.glb',
  './assets/models/bench.glb',
  './assets/models/boat_row.glb',
  './assets/models/box.glb',
  './assets/models/bucket.glb',
  './assets/models/bush_a.glb',
  './assets/models/bush_b.glb',
  './assets/models/bush_c.glb',
  './assets/models/bush_d.glb',
  './assets/models/campfire.glb',
  './assets/models/cart.glb',
  './assets/models/chimney.glb',
  './assets/models/door.glb',
  './assets/models/fence.glb',
  './assets/models/fern_a.glb',
  './assets/models/fern_b.glb',
  './assets/models/fish_l.glb',
  './assets/models/fish_s.glb',
  './assets/models/fl_p1.glb',
  './assets/models/fl_p2.glb',
  './assets/models/fl_r1.glb',
  './assets/models/fl_r2.glb',
  './assets/models/fl_y1.glb',
  './assets/models/fl_y2.glb',
  './assets/models/hedge_l.glb',
  './assets/models/interior/i_anvil.glb',
  './assets/models/interior/i_axe.glb',
  './assets/models/interior/i_bar.glb',
  './assets/models/interior/i_barrel.glb',
  './assets/models/interior/i_barrelO.glb',
  './assets/models/interior/i_bear.glb',
  './assets/models/interior/i_bedD.glb',
  './assets/models/interior/i_bedS.glb',
  './assets/models/interior/i_books.glb',
  './assets/models/interior/i_bottle.glb',
  './assets/models/interior/i_boxO.glb',
  './assets/models/interior/i_bucket.glb',
  './assets/models/interior/i_cab.glb',
  './assets/models/interior/i_cabU.glb',
  './assets/models/interior/i_chair.glb',
  './assets/models/interior/i_chairC.glb',
  './assets/models/interior/i_chest.glb',
  './assets/models/interior/i_coat.glb',
  './assets/models/interior/i_coffee.glb',
  './assets/models/interior/i_counter.glb',
  './assets/models/interior/i_crate.glb',
  './assets/models/interior/i_crateB.glb',
  './assets/models/interior/i_desk.glb',
  './assets/models/interior/i_fish.glb',
  './assets/models/interior/i_grind.glb',
  './assets/models/interior/i_hammer.glb',
  './assets/models/interior/i_lampF.glb',
  './assets/models/interior/i_lampT.glb',
  './assets/models/interior/i_lampW.glb',
  './assets/models/interior/i_lantern.glb',
  './assets/models/interior/i_lounge.glb',
  './assets/models/interior/i_mat.glb',
  './assets/models/interior/i_pickaxe.glb',
  './assets/models/interior/i_pillow.glb',
  './assets/models/interior/i_plant1.glb',
  './assets/models/interior/i_plant2.glb',
  './assets/models/interior/i_pot.glb',
  './assets/models/interior/i_radio.glb',
  './assets/models/interior/i_rugO.glb',
  './assets/models/interior/i_rugR.glb',
  './assets/models/interior/i_seatLow.glb',
  './assets/models/interior/i_shelfC.glb',
  './assets/models/interior/i_shelfL.glb',
  './assets/models/interior/i_shelfO.glb',
  './assets/models/interior/i_ship.glb',
  './assets/models/interior/i_side.glb',
  './assets/models/interior/i_sink.glb',
  './assets/models/interior/i_stool.glb',
  './assets/models/interior/i_table.glb',
  './assets/models/interior/i_tableC.glb',
  './assets/models/interior/i_tableO.glb',
  './assets/models/lantern.glb',
  './assets/models/lily_l.glb',
  './assets/models/lily_s.glb',
  './assets/models/log_a.glb',
  './assets/models/log_b.glb',
  './assets/models/log_s.glb',
  './assets/models/log_sl.glb',
  './assets/models/moss.glb',
  './assets/models/mush_r.glb',
  './assets/models/mush_s.glb',
  './assets/models/mush_t.glb',
  './assets/models/paddle.glb',
  './assets/models/pine_a.glb',
  './assets/models/pine_b.glb',
  './assets/models/pine_c.glb',
  './assets/models/pine_d.glb',
  './assets/models/pine_e.glb',
  './assets/models/pine_f.glb',
  './assets/models/pine_g.glb',
  './assets/models/pine_k.glb',
  './assets/models/pine_s.glb',
  './assets/models/planks.glb',
  './assets/models/post.glb',
  './assets/models/pot.glb',
  './assets/models/roof.glb',
  './assets/models/signpost.glb',
  './assets/models/stone_l1.glb',
  './assets/models/stone_l2.glb',
  './assets/models/stone_l3.glb',
  './assets/models/stone_s1.glb',
  './assets/models/stone_s2.glb',
  './assets/models/stone_s3.glb',
  './assets/models/stone_t1.glb',
  './assets/models/stone_t2.glb',
  './assets/models/stone_t3.glb',
  './assets/models/stump_a.glb',
  './assets/models/stump_b.glb',
  './assets/models/stump_t.glb',
  './assets/models/tree_a.glb',
  './assets/models/tree_b.glb',
  './assets/models/tree_c.glb',
  './assets/models/tree_d.glb',
  './assets/models/tree_e.glb',
  './assets/models/tree_g.glb',
  './assets/models/wall_block.glb',
  './assets/models/wall_wood.glb',
  './assets/models/window.glb',
  './index.html',
  './src/app.js',
  './src/app/camera.js',
  './src/app/fightFlow.js',
  './src/app/fishing.js',
  './src/app/hooks.js',
  './src/app/hud.js',
  './src/app/input.js',
  './src/app/interiorMode.js',
  './src/app/light.js',
  './src/app/loop.js',
  './src/app/roomFacts.js',
  './src/app/roomTap.js',
  './src/app/settings.js',
  './src/app/tiers.js',
  './src/app/view.js',
  './src/app/viewport.js',
  './src/app/walk.js',
  './src/app/warm.js',
  './src/art/ecoIcons.js',
  './src/art/folk.js',
  './src/art/sheets.js',
  './src/art/signs.js',
  './src/art/textures.js',
  './src/art/uiIcons.js',
  './src/boat/boat.js',
  './src/challenge/debug.js',
  './src/challenge/fight.js',
  './src/challenge/quests.js',
  './src/challenge/state.js',
  './src/challenge/wear.js',
  './src/data/allSpecies.js',
  './src/data/boat.js',
  './src/data/challenge.js',
  './src/data/dialogues-interior.js',
  './src/data/dream.js',
  './src/data/economy.js',
  './src/data/fishOverrides.js',
  './src/data/interiors.js',
  './src/data/map.js',
  './src/data/models.js',
  './src/data/params.js',
  './src/data/story.js',
  './src/data/strings-boat.js',
  './src/data/strings-chal.js',
  './src/data/strings-eco.js',
  './src/data/strings-interior.js',
  './src/data/strings-story-b.js',
  './src/data/strings-story.js',
  './src/data/strings-ui.js',
  './src/data/strings.js',
  './src/economy/debug.js',
  './src/economy/draw.js',
  './src/economy/model.js',
  './src/economy/shopUi.js',
  './src/economy/store.js',
  './src/interior/actions.js',
  './src/interior/layout.js',
  './src/interior/lighting.js',
  './src/interior/logic.js',
  './src/interior/pieces.js',
  './src/interior/room.js',
  './src/interior/sleep.js',
  './src/logic/camera.js',
  './src/logic/collide.js',
  './src/logic/daylight.js',
  './src/logic/decor.js',
  './src/logic/field.js',
  './src/logic/look.js',
  './src/logic/mapgen.js',
  './src/logic/nav.js',
  './src/logic/occlusion.js',
  './src/logic/placeName.js',
  './src/logic/quality.js',
  './src/logic/spots.js',
  './src/logic/terrain.js',
  './src/logic/villagers.js',
  './src/main.js',
  './src/offline.js',
  './src/shell/boot.js',
  './src/shell/dialogueUi.js',
  './src/shell/fightUi.js',
  './src/shell/lullaby.js',
  './src/shell/machine.js',
  './src/shell/panels.js',
  './src/shell/persist.js',
  './src/shell/photo.js',
  './src/shell/save.js',
  './src/shell/shell.js',
  './src/shell/shop.js',
  './src/shell/sound.js',
  './src/shell/storyPanels.js',
  './src/shell/tabs.js',
  './src/shell/ui/announce.js',
  './src/shell/ui/bag.js',
  './src/shell/ui/coach.js',
  './src/shell/ui/focusOrder.js',
  './src/shell/ui/hintState.js',
  './src/shell/ui/listNav.js',
  './src/shell/ui/menu.js',
  './src/shell/ui/panelStack.js',
  './src/shell/ui/tooltip.js',
  './src/story/cond.js',
  './src/story/dialogue.js',
  './src/story/engine.js',
  './src/story/env.js',
  './src/story/finale.js',
  './src/world/boatModel.js',
  './src/world/build.js',
  './src/world/decor.js',
  './src/world/geo.js',
  './src/world/grass.js',
  './src/world/lakeLights.js',
  './src/world/life.js',
  './src/world/modelProps.js',
  './src/world/models.js',
  './src/world/painters.js',
  './src/world/particles.js',
  './src/world/pause.js',
  './src/world/post.js',
  './src/world/rain.js',
  './src/world/shading.js',
  './src/world/sky.js',
  './src/world/sprites.js',
  './src/world/terrain3d.js',
  './src/world/water.js',
  './styles.css',
  '../src/art/dither.js',
  '../src/art/fishPaint.js',
  '../src/art/framePaint.js',
  '../src/art/painter.js',
  '../src/art/palette.js',
  '../src/art/raster.js',
  '../src/audio/engine.js',
  '../src/audio/hooks.js',
  '../src/audio/noise.js',
  '../src/audio/trackLoader.js',
  '../src/core/audioMix.js',
  '../src/core/clock.js',
  '../src/core/collection.js',
  '../src/core/crossfade.js',
  '../src/core/fishDraw.js',
  '../src/core/fishing.js',
  '../src/core/game.js',
  '../src/core/lang.js',
  '../src/core/playlist.js',
  '../src/core/rng.js',
  '../src/core/save.js',
  '../src/core/sizeRoll.js',
  '../src/core/sky.js',
  '../src/core/toast.js',
  '../src/core/weather.js',
  '../src/data/audio.js',
  '../src/data/config.js',
  '../src/data/fishSprites.js',
  '../src/data/icons.js',
  '../src/data/sky.js',
  '../src/data/species.js',
  '../src/data/strings.en.js',
  '../src/data/strings.fr.js',
  '../src/data/weather.js',
  '../src/input/input.js',
  '../src/platform/debug.js',
  '../src/platform/storage.js',
  '../src/render/photo.js',
  '../src/ui/book.js',
  '../src/ui/i18n.js',
  '../src/ui/icons.js',
  '../src/ui/rarity.js',
  '../src/ui/settings.js',
  '../vendor/fonts/pixelify-sans/pixelify-sans-latin-400-normal.woff2',
  '../vendor/three/postprocessing/EffectComposer.js',
  '../vendor/three/postprocessing/MaskPass.js',
  '../vendor/three/postprocessing/OutputPass.js',
  '../vendor/three/postprocessing/Pass.js',
  '../vendor/three/postprocessing/RenderPass.js',
  '../vendor/three/postprocessing/ShaderPass.js',
  '../vendor/three/postprocessing/UnrealBloomPass.js',
  '../vendor/three/shaders/CopyShader.js',
  '../vendor/three/shaders/LuminosityHighPassShader.js',
  '../vendor/three/shaders/OutputShader.js',
  '../vendor/three/three.core.js',
  '../vendor/three/three.module.js',
];
// run-time cache only (see the top of this file): the recorded tracks
const MUSIC = [
  '../assets/music/chill-lofi-inspired.mp3',
  '../assets/music/lofi-again.ogg',
  '../assets/music/lofi-hip-hop-loop.ogg',
];
// END FILES
const CACHE_PREFIX = 'lullaby-hd2d-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const MUSIC_URLS = MUSIC.map((f) => new URL(f, self.location.href).href);

function network(request) {
  return fetch(request);
}

/** '206' answer for a Range header on a full cached response; the whole response when the header is not a single simple range. */
function slice(hit, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
  if (!m || (m[1] === '' && m[2] === '')) return Promise.resolve(hit);
  return hit.arrayBuffer().then((buf) => {
    const size = buf.byteLength;
    let start;
    let end;
    if (m[1] === '') {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    const type = (hit.headers && hit.headers.get('Content-Type')) || 'application/octet-stream';
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    const body = buf.slice(start, end + 1);
    return new Response(body, { status: 206, statusText: 'Partial Content', headers: { 'Content-Type': type, 'Content-Length': String(body.byteLength), 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Accept-Ranges': 'bytes' } });
  });
}

/** This version's cache, or null when it does not exist (deleted by ?nosw=1 while a page still runs): never re-created outside install. */
function ownCache() {
  return caches.has(CACHE_NAME).then((ok) => (ok ? caches.open(CACHE_NAME) : null));
}

function music(event) {
  const request = event.request;
  const range = request.headers && request.headers.get ? request.headers.get('range') : null;
  return ownCache().then((cache) =>
    (cache ? cache.match(request.url) : Promise.resolve(undefined)).then((hit) => {
      if (hit) return range ? slice(hit, range) : hit;
      return network(request).then((res) => {
        const type = (res.headers && res.headers.get && res.headers.get('Content-Type')) || '';
        if (cache && !range && res.ok && res.status === 200 && !/^text\//i.test(type)) {
          const stored = cache.put(request.url, res.clone()).catch(() => {}); // a full quota or a closed cache never breaks the playback
          if (event.waitUntil) event.waitUntil(stored);
        }
        return res;
      });
    }),
  );
}

function answer(request) {
  const isPage = request.mode === 'navigate';
  return ownCache().then((cache) => {
    if (!cache) return network(request);
    return cache.match(request, { ignoreSearch: isPage }).then((hit) => {
      if (hit) return hit;
      if (isPage) return cache.match('./index.html').then((page) => page || network(request));
      return network(request);
    });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(MUSIC_URLS.includes(request.url) ? music(event) : answer(request));
});
