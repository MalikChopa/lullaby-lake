// Drawing parameters of the 24 fish sprites (40x24 px canvas, drawn by art/fishPaint.js; see its header for every field).
// Data only, no logic. Original designs; the colours of the first seven come from the approved mock-up (maquette/v2).
// Sprites 13 to 24 were added in J6 (new painter options: patches, scutes, rays, fade, bolt, streak tail).
//   colors : [back, belly, fin]    rx / ry : half length / half height of the body
export default Object.freeze({
  // 1 - slim blue-grey oval, pale belly, pink fins, half-closed eye
  'gardon-reveur': { colors: ['#8fa6c8', '#e6eef8', '#d9809a'], rx: 13, ry: 5, pat: 'none', eye: 'half', sheen: true },
  // 2 - round golden carp, pale scales, fan tail, barbel
  'carpe-lune': { colors: ['#e8b24e', '#fff0c0', '#e8805a'], rx: 15, ry: 7, cx: 22, pat: 'scale', barbel: true },
  // 3 - olive green, four dark bars, spiky dorsal, red fins
  'perche-ambree': { colors: ['#7f9a3c', '#f1d28a', '#e0605a'], rx: 13, ry: 7, pat: 'bars', dorsal: 'spikes' },
  // 4 - thick moss green, tufts on the back, orange-red eye
  'tanche-mousse': { colors: ['#4a7a58', '#a8c48a', '#3a5a48'], rx: 13, ry: 7, pat: 'none', tufts: true, dorsal: 'none', eyeColor: '#f08a3a', tail: 6 },
  // 5 - lilac-grey, white dots, edges that melt like steam
  'truite-brume': { colors: ['#9aa8d0', '#f4f0f8', '#6a72b0'], rx: 15, ry: 5, pat: 'dots', steam: true },
  // 6 - silver ribbon in an S, very thin, continuous fin
  'anguille-argent': { colors: ['#aab6c8', '#e8eef4', '#7a86a0'], ribbon: true, rx: 17, ry: 2, pat: 'none' },
  // 7 - small, salmon pink, white glint on the flank
  'ablette-aurore': { colors: ['#f08a6a', '#ffd9b8', '#d9709a'], rx: 11, ry: 4, pat: 'none', sheen: true, tail: 6 },
  // 8 - tiny sea-green, three golden spines, pale yellow dots
  'epinoche-etoilee': { colors: ['#5a9a80', '#cfe8d8', '#f8b878'], rx: 9, ry: 4, pat: 'dots', dotColor: '#fff2a8', dorsal: 'spines', tail: 5 },
  // 9 - long night-blue pike, flat snout, lighter marbling, yellow eye
  'brochet-ombre': { colors: ['#3b3a73', '#8a82b0', '#54518f'], rx: 14, ry: 5, cx: 21, pat: 'marble', snout: true, eyeColor: '#ffd24a', eyeDx: 3, tail: 6 },
  // 10 - big dark purple catfish, long drooping whiskers, small eyes
  'silure-sage': { colors: ['#5a3f7e', '#a08ac0', '#3e2a5c'], rx: 14, ry: 7, cx: 22, pat: 'none', whiskers: true, eye: 'tiny', eyeDx: 3, dorsal: 'none', tail: 6 },
  // 11 - round cream lantern, antenna with a yellow bulb, lit in the water at night
  'veilleuse': { colors: ['#f6e6c0', '#fffaf0', '#f0a870'], rx: 8, ry: 6, cy: 15, pat: 'none', antenna: true, dorsal: 'none', ventral: 'none', sideFin: false, tail: 5, glow: true },
  // 12 - large pearl and pale gold, veil fins, a pattern of musical notes
  'berceuse': { colors: ['#d8d0ec', '#fff8e8', '#f0d890'], rx: 14, ry: 7, cx: 24, pat: 'none', tailStyle: 'veil', dorsal: 'veil', ventral: 'veil', notes: true, tail: 9 },
  // 13 - slim honey-gold minnow, pale yellow fins, a dotted flank, no dorsal fin
  'vairon-miel': { colors: ['#d9a441', '#fff0c8', '#f6dc8e'], rx: 10, ry: 3, pat: 'spot', dorsal: 'none', sideFin: false, tail: 5, sheen: true, eyeColor: '#fff6d8' },
  // 14 - blue gudgeon with dark spots and two barbels
  'goujon-pluie': { colors: ['#4f9cb0', '#dcf0ec', '#7ab8c8'], rx: 11, ry: 5, pat: 'dots', dotColor: '#1f3a5c', barbel: true, tail: 6 },
  // 15 - deep, flat, soft grey bream
  'breme-nuage': { colors: ['#b4bcc8', '#f0f2f6', '#8c96aa'], rx: 11, ry: 8, cy: 13, pat: 'scale', ventral: 'none', tail: 6 },
  // 16 - long bronze chub with thin vertical reed stripes, yellow-brown fins
  'chevesne-roseau': { colors: ['#b59a52', '#f0e4b8', '#9a8648'], rx: 15, ry: 4, pat: 'stripe', tail: 6 },
  // 17 - red-orange rudd, glowing scales, yellow eye
  'rotengle-braise': { colors: ['#d8643c', '#f8c890', '#e04a40'], rx: 12, ry: 6, pat: 'scale', eyeColor: '#ffd24a', tail: 6 },
  // 18 - pale glass-green zander, rear half dissolving into the water
  'sandre-fantome': { colors: ['#a8c8c8', '#eef6f4', '#7aa0a8'], rx: 15, ry: 5, pat: 'none', dorsal: 'spikes', fade: true, eyeColor: '#e8f8ff', tail: 7 },
  // 19 - slate-blue ide with two yellow lightning flashes
  'ide-orage': { colors: ['#46587e', '#b8c4dc', '#68789e'], rx: 13, ry: 6, pat: 'none', bolt: true, tail: 6 },
  // 20 - olive barbel sprinkled with pink petals, two barbels
  'barbeau-fleuri': { colors: ['#8a8f5c', '#e8e0b8', '#d890a8'], rx: 14, ry: 5, pat: 'dots', dotColor: '#ffb8d0', barbel: true, tail: 6 },
  // 21 - cream koi with orange patches
  'koi-paisible': { colors: ['#f4efe6', '#fffaf0', '#f2b8a0'], rx: 14, ry: 6, pat: 'patches', patchColor: '#e8653a', tail: 7 },
  // 22 - long slate sturgeon, bony plates, flat snout
  'esturgeon-ancien': { colors: ['#5f7a82', '#c8d8d8', '#486068'], rx: 14, ry: 5, cx: 21, pat: 'none', snout: true, scutes: true, eye: 'tiny', eyeDx: 3, tail: 6 },
  // 23 - round golden sunfish with a ring of rays
  'soleil-midi': { colors: ['#f0b838', '#fff0b0', '#f08a28'], rx: 8, ry: 7, pat: 'none', rays: true, dorsal: 'none', ventral: 'none', sheen: true, tail: 5 },
  // 24 - small indigo comet fish with a long glittering trail
  'comete': { colors: ['#2c3a8c', '#aab8ff', '#7ae0ff'], rx: 9, ry: 5, pat: 'dots', dotColor: '#ffffff', tailStyle: 'streak', dorsal: 'none', ventral: 'none', sideFin: false, sheen: true, glow: true, tail: 16 },
});
