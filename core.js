'use strict';
/* Game data and rules. No DOM access in this file, so it also runs in the headless balance simulation. */

// ---------- Formatting ----------
const SHORT_SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc'];
const LONG_SUFFIX = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion',
  'septillion', 'octillion', 'nonillion', 'decillion', 'undecillion', 'duodecillion', 'tredecillion',
  'quattuordecillion', 'quindecillion'];
function fmt(n, long = false) {
  if (!isFinite(n)) return '∞';
  if (n < 1e6) {
    if (n < 10 && n % 1) return n.toFixed(1);
    return Math.floor(n).toLocaleString('en-US');
  }
  const i = Math.floor(Math.log10(n) / 3);
  if (i >= SHORT_SUFFIX.length) return n.toExponential(3);
  const v = (n / 10 ** (i * 3)).toFixed(long ? 3 : 2);
  return long ? `${v} ${LONG_SUFFIX[i]}` : v + SHORT_SUFFIX[i];
}
function fmtTime(s) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  if (d) return `${d}d ${h}h`;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}
const rand = (a, b) => a + Math.random() * (b - a);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;

// ---------- Stages ----------
// Images are pre-cropped squares, so every stage is centred.
const STAGES = [
  { at: 0,    name: 'Little Helper',      icon: '🥄', img: 'stage1.jpg',  pos: '50% 50%', text: 'Stirring the pot from a stool. Grandma says you\'re a natural.' },
  { at: 1e3,  name: 'Dishwasher',         icon: '🧼', img: 'stage2.jpg',  pos: '50% 50%', text: 'Elbow-deep in suds. Every broken plate is a lesson.' },
  { at: 3e4,  name: 'Delivery Runner',    icon: '🎒', img: 'stage3.jpg',  pos: '50% 50%', text: 'Backpack full of hot soup, fifth floor, no elevator.' },
  { at: 1e6,  name: 'Prep Cook',          icon: '📦', img: 'stage4.jpg',  pos: '50% 50%', text: 'Forty onions before sunrise. The tears are part of the recipe.' },
  { at: 3e7,  name: 'Knife Guy',          icon: '🔪', img: 'stage5.jpg',  pos: '50% 50%', text: 'Sharpens everything. Has a favourite knife. Gave it a name.' },
  { at: 1e9,  name: 'Recipe Blogger',     icon: '💻', img: 'stage6.jpg',  pos: '50% 50%', text: 'Twelve paragraphs about your childhood, then the recipe.' },
  { at: 1e10, name: 'Head of Accounting', icon: '🧮', img: 'stage7.jpg',  pos: '50% 50%', text: 'Counting receipts. Saffron costs HOW much?' },
  { at: 1e12, name: 'Head Chef',          icon: '🪵', img: 'stage8.jpg',  pos: '50% 50%', text: 'Holds the rolling pin. The whole kitchen goes quiet when you walk in.' },
  { at: 3e13, name: 'Night-Shift Owner',  icon: '💡', img: 'stage9.jpg',  pos: '50% 50%', text: '3 AM, one big monitor, six empty hot-sauce bottles. The empire never sleeps.' },
  { at: 3e14, name: 'Chief Taste Tester', icon: '🫃', img: 'stage10.jpg', pos: '50% 50%', text: 'Tasted every dish ever cooked. The jacket no longer zips.' },
  { at: 1e15, name: 'Kitchen Overlord',   icon: '👿', img: 'stage11.jpg', pos: '50% 50%', text: 'The ovens answer to you now. Even the ones in hell.' },
];
const LEGEND_STEP = 1000; // each Inferno rank needs 1000× more lifetime steaks

// ---------- Buildings ----------
// name is singular, pl is plural (used in descriptions such as "Own 50 Burnt Toasters").
const BUILDINGS = [
  { id: 'pushups',    name: 'Burnt Toaster',        pl: 'Burnt Toasters',        icon: '🍞', cost: 12,     gps: 0.15,   desc: 'Only one setting: charcoal. People order it anyway.' },
  { id: 'dumbbells',  name: 'Rusty Pan',            pl: 'Rusty Pans',            icon: '🫕', cost: 110,    gps: 1.2,    desc: 'Seasoned with forty years of mystery. Never wash it.' },
  { id: 'pullup',     name: 'Microwave',            pl: 'Microwaves',            icon: '🍥', cost: 1300,   gps: 8.4,    desc: 'Ding! Instant noodles and a tiny lightning storm.' },
  { id: 'kettlebell', name: 'Deep Fryer',           pl: 'Deep Fryers',           icon: '🍟', cost: 16000,  gps: 55,     desc: 'If it fits in the basket, it gets fried. Including the menu.' },
  { id: 'bench',      name: 'Grill Station',        pl: 'Grill Stations',        icon: '🍢', cost: 2e5,    gps: 330,    desc: 'Perfect stripes on everything. Even the salad.' },
  { id: 'squat',      name: 'Pizza Oven',           pl: 'Pizza Ovens',           icon: '🍕', cost: 2.6e6,  gps: 2000,   desc: 'Nine hundred degrees of wood-fired confidence.' },
  { id: 'trainer',    name: 'Line Cook',            pl: 'Line Cooks',            icon: '🎩', cost: 3.4e7,  gps: 12000,  desc: 'Yells "Heard!" and actually heard.' },
  { id: 'buddy',      name: 'Dishwasher Crew',      pl: 'Dishwasher Crews',      icon: '🧼', cost: 4.8e8,  gps: 71000,  desc: 'A mountain of plates goes in, a sparkling mountain comes out.' },
  { id: 'mealprep',   name: 'Walk-in Freezer',      pl: 'Walk-in Freezers',      icon: '🥶', cost: 6.7e9,  gps: 4.2e5,  desc: 'Something in the back has been there since 1998. It hums.' },
  { id: 'supps',      name: 'Hot Sauce Lab',        pl: 'Hot Sauce Labs',        icon: '🌶️', cost: 9.4e10, gps: 2.5e6,  desc: 'Spiciness measured in screams per spoon.' },
  { id: 'homegym',    name: 'Diner',                pl: 'Diners',                icon: '🍔', cost: 1.3e12, gps: 1.5e7,  desc: 'Open all night. Coffee refills are a lifestyle.' },
  { id: 'lab',        name: 'Molecular Kitchen',    pl: 'Molecular Kitchens',    icon: '⚗️', cost: 1.8e13, gps: 9.9e7,  desc: 'Foams, gels and a chef in safety goggles.' },
  { id: 'club',       name: 'Five-Star Restaurant', pl: 'Five-Star Restaurants', icon: '🍽️', cost: 2.8e14, gps: 6.5e8,  desc: 'Even the napkins have napkins.' },
  { id: 'camp',       name: 'Catering Empire',      pl: 'Catering Empires',      icon: '🚐', cost: 4.1e15, gps: 4.2e9,  desc: 'Weddings, funerals, rocket launches. You bring the canapés.' },
  { id: 'chain',      name: 'Franchise Chain',      pl: 'Franchise Chains',      icon: '🌍', cost: 6.2e16, gps: 2.7e10, desc: 'The same burnt toast on every corner of the planet.' },
  { id: 'olympic',    name: 'Food Festival',        pl: 'Food Festivals',        icon: '🎪', cost: 9.3e17, gps: 1.8e11, desc: 'A million tasting spoons and one very tired cleaning crew.' },
  { id: 'moon',       name: 'Volcano Kitchen',      pl: 'Volcano Kitchens',      icon: '🌋', cost: 1.4e19, gps: 1.2e12, desc: 'Free lava grill. The extractor fan is the sky.' },
  { id: 'galaxy',     name: 'Inferno Kitchen',      pl: 'Inferno Kitchens',      icon: '🔱', cost: 2.1e20, gps: 7.5e12, desc: 'Ovens fed by actual hellfire. The rent is paid in souls.' },
];
const B_BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
const bName = (b, n) => (n === 1 ? b.name : b.pl);

// Chef skills (internal name: muscles).
const MUSCLES = [
  { id: 'arms',  name: 'Knife Skills', icon: '🔪', base: 1000,  desc: '+10% click power per level' },
  { id: 'chest', name: 'Seasoning',    icon: '🧂', base: 5000,  desc: '+5% steaks per second per level' },
  { id: 'core',  name: 'Stamina',      icon: '☕', base: 10000, desc: 'Dinner Rush and other boosts last 3% longer per level' },
  { id: 'legs',  name: 'Speed',        icon: '👟', base: 20000, desc: '+1% critical click chance per level (crits earn ×5)' },
  { id: 'back',  name: 'Instinct',     icon: '👃', base: 50000, desc: 'Golden dumplings appear 5% more often per level' },
];
const MUSCLE_MAX = 20;

// Signature dishes (internal name: lifts / records). Endless, never reset.
const LIFTS = [
  { id: 'bench',    name: 'Soufflé',    icon: '🧁', unit: 'cm tall',      start: 60,  step: 2.5, base: 1e15, growth: 1.9, desc: '+4% steaks per second per perfected soufflé' },
  { id: 'squat',    name: 'Ramen',      icon: '🍜', unit: 'h broth',      start: 80,  step: 5,   base: 3e15, growth: 1.9, desc: '+6% click power per perfected ramen' },
  { id: 'deadlift', name: 'Wellington', icon: '🥧', unit: 'pastry layers', start: 100, step: 5,  base: 1e16, growth: 2,   desc: '+2% to everything per perfected Wellington' },
  { id: 'ohp',      name: 'Flambé',     icon: '🥃', unit: 'cm of flame',  start: 40,  step: 2.5, base: 5e15, growth: 2.2, desc: 'Buildings 1% cheaper per perfected flambé (up to 50%)' },
];
// Display text for a signature dish level, e.g. "62.5 cm tall".
function recordLabel(l, n = rec(l.id)) { const w = recordWeight(l, n); return `${w % 1 ? w.toFixed(1) : fmt(w)} ${l.unit}`; }

// ---------- Chef's Secrets (star perk tree) ----------
// Service style: one focus per run, each with a trade-off. Unlocks at Delivery Runner.
const SPLITS = [
  { id: 'full',   name: 'À la carte',   icon: '📃', desc: 'Balanced. No bonus, no penalty.' },
  { id: 'push',   name: 'Fast Food',    icon: '🌭', desc: 'Clicks ×2. Steaks per second ×0.85.' },
  { id: 'pull',   name: 'Street Food',  icon: '🌮', desc: 'Golden dumplings appear 30% more often. Their buffs are 20% shorter.' },
  { id: 'legs',   name: 'Teppanyaki',   icon: '♨️', desc: 'Critical clicks earn ×8 instead of ×5, but normal clicks earn 20% less.' },
  { id: 'cardio', name: 'Buffet',       icon: '🍱', desc: 'Buildings are 10% cheaper. Steaks per second ×0.9.' },
  { id: 'rest',   name: 'Slow Cooking', icon: '🍲', desc: 'Steaks per second ×1.25. Clicks ×0.25.' },
];
const SPLIT_BY_ID = Object.fromEntries(SPLITS.map(s => [s.id, s]));
const SPLIT_COOLDOWN = 300;
const splitsUnlocked = () => S.bestStage >= 2;
const split = () => (splitsUnlocked() ? S.split : 'full');

const PERKS = [
  { id: 'card',       branch: 'Mise en Place', name: 'Kitchen Pass',      icon: '🪪', cost: 1,     req: [],                  desc: 'Opens the Chef\'s Secrets and adds +5% to everything.' },
  { id: 'discipline', branch: 'Mise en Place', name: 'Yes, Chef!',        icon: '📈', cost: 5,     req: ['card'], repeat: true, desc: '+10% to everything per level. Can be bought forever.' },
  { id: 'headstart',  branch: 'Opening Day',   name: 'Packed Lunch',      icon: '🎒', cost: 3,     req: ['card'],            desc: 'Start every run with 10 Burnt Toasters and 5 Rusty Pans.' },
  { id: 'savings',    branch: 'Opening Day',   name: 'Petty Cash',        icon: '🫙', cost: 10,    req: ['headstart'],       desc: 'Start every run with 1,000 steaks per star.' },
  { id: 'starterkit', branch: 'Opening Day',   name: 'Stocked Pantry',    icon: '🥫', cost: 60,    req: ['savings'],         desc: 'Start every run with 10 of each of the first six buildings.' },
  { id: 'lucky',      branch: 'Dumplings',     name: 'Lucky Chopsticks',  icon: '🥢', cost: 5,     req: ['card'],            desc: 'Golden dumplings appear 15% more often.' },
  { id: 'goldtouch',  branch: 'Dumplings',     name: 'Golden Steam',      icon: '✨', cost: 25,    req: ['lucky'],           desc: 'Golden dumplings stay on screen 50% longer.' },
  { id: 'streak',     branch: 'Dumplings',     name: 'Hot Streak',        icon: '🎲', cost: 100,   req: ['goldtouch'],       desc: 'Golden dumpling buffs last 20% longer.' },
  { id: 'rain',       branch: 'Dumplings',     name: 'Dumpling Monsoon',  icon: '🌧️', cost: 400,   req: ['streak'],          desc: 'Dumpling Rain is three times as likely.' },
  { id: 'partner',    branch: 'The Line',      name: 'Sous-Chef',         icon: '🧤', cost: 10,    req: ['card'],            desc: 'Cooks for you twice per second.' },
  { id: 'steady',     branch: 'The Line',      name: 'Steady Hand',       icon: '🎛️', cost: 20,    req: ['partner'],         desc: 'Clicks also earn 1% of your steaks per second.' },
  { id: 'group',      branch: 'The Line',      name: 'Kitchen Brigade',   icon: '👥', cost: 150,   req: ['partner'],         desc: 'Your sous-chefs cook 5 times per second.' },
  { id: 'memory',     branch: 'The Line',      name: 'Family Notebook',   icon: '📓', cost: 40,    req: ['steady'],          desc: 'Keep a quarter of your chef skill levels after a cook-off.' },
  { id: 'rest',       branch: 'Closing Time',  name: 'Overnight Proofing', icon: '🛌', cost: 15,   req: ['card'],            desc: 'Offline progress runs at full speed for up to 8 hours (normally 50% for 2 hours).' },
  { id: 'weekend',    branch: 'Closing Time',  name: 'Closed for Holidays', icon: '🏕️', cost: 200, req: ['rest'],            desc: 'Offline progress lasts up to 3 days.' },
  { id: 'scoopfast',  branch: 'Closing Time',  name: 'Warm Corner',       icon: '🌡️', cost: 120,   req: ['rest'],            desc: 'Sourdough loaves grow 25% faster.' },
  { id: 'physio',     branch: 'Closing Time',  name: 'Concierge Desk',    icon: '🛎️', cost: 250,   req: ['rest', 'recipes'], desc: 'Unlocks three extra Hospitality upgrades.' },
  { id: 'coupon',     branch: 'Back Office',   name: 'Coupon Book',       icon: '🎟️', cost: 8,     req: ['card'],            desc: 'Buildings are 3% cheaper.' },
  { id: 'member',     branch: 'Back Office',   name: 'Chef\'s Discount',  icon: '🏷️', cost: 60,    req: ['coupon'],          desc: 'Upgrades are 5% cheaper.' },
  { id: 'wholesale',  branch: 'Back Office',   name: 'Wholesale Market',  icon: '🚚', cost: 300,   req: ['member'],          desc: 'Buildings are another 5% cheaper.' },
  { id: 'sponsor',    branch: 'Back Office',   name: 'Food Blog Sponsor', icon: '🤝', cost: 75,    req: ['coupon'],          desc: 'Each star gives +4.5% instead of +3%.' },
  { id: 'bigsponsor', branch: 'Back Office',   name: 'Prime-Time TV Deal', icon: '📺', cost: 5000, req: ['sponsor', 'cross2'], desc: 'Each star gives +6%.' },
  { id: 'cross',      branch: 'Fusion',        name: 'Fusion Cuisine',    icon: '🔀', cost: 30,    req: ['card'],            desc: 'Unlocks Kitchen Combo upgrades (at 15 of each building).' },
  { id: 'cross2',     branch: 'Fusion',        name: 'Advanced Fusion',   icon: '🔁', cost: 500,   req: ['cross', 'member'], desc: 'Unlocks a second set of Kitchen Combos (at 75 of each building).' },
  { id: 'recipes',    branch: 'Fusion',        name: 'Grandma\'s Recipes', icon: '📖', cost: 80,   req: ['cross'],           desc: 'Unlocks ten extra Ingredient upgrades.' },
  { id: 'locker1',    branch: 'Recipe Box',    name: 'Recipe Box I',      icon: '🗃️', cost: 20,    req: ['card'],            desc: 'Choose one upgrade to keep after every cook-off.' },
  { id: 'locker2',    branch: 'Recipe Box',    name: 'Recipe Box II',     icon: '🗃️', cost: 150,   req: ['locker1'],         desc: 'A second Recipe Box slot.' },
  { id: 'locker3',    branch: 'Recipe Box',    name: 'Recipe Box III',    icon: '🗃️', cost: 800,   req: ['locker2'],         desc: 'A third Recipe Box slot.' },
  { id: 'locker4',    branch: 'Recipe Box',    name: 'Recipe Box IV',     icon: '🗃️', cost: 3000,  req: ['locker3'],         desc: 'A fourth Recipe Box slot.' },
  { id: 'locker5',    branch: 'Recipe Box',    name: 'Recipe Box V',      icon: '🗃️', cost: 1e4,   req: ['locker4'],         desc: 'A fifth Recipe Box slot.' },
];
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));
const PERK_BRANCHES = [...new Set(PERKS.map(p => p.branch))];

// ---------- Upgrades ----------
const UPGRADES = [];
const addUpg = u => UPGRADES.push(u);

// Tier upgrades: each doubles one building. The first three Burnt Toaster tiers also double clicks.
const TIERS = [[1, 10], [10, 60], [30, 700], [60, 8e4], [100, 1e7], [150, 1.2e9], [200, 1.5e11], [250, 2e14], [300, 3e17], [350, 4e20], [400, 5e23]];
// One escalating name per tier, per building.
const TIER_NAMES = {
  pushups: ['Scraped-Clean Toaster', 'Two-Slot Toaster', 'Four-Slot Toaster', 'Bagel Mode', 'Smoke Alarm Unplugged', 'Chrome Toaster', 'Conveyor Toaster', 'Toaster of Legend', 'Sentient Toaster', 'Toaster That Knows', 'Hellfire Toaster'],
  dumbbells: ['Scrubbed Pan', 'Seasoned Pan', 'Cast-Iron Pan', 'Non-Stick Miracle', 'Copper-Bottom Pan', 'Grandma\'s Heirloom', 'Wok of Ages', 'Self-Flipping Pan', 'Pan of Destiny', 'Pan of a Thousand Omelettes', 'Infernal Skillet'],
  pullup: ['Turntable Fixed', 'Popcorn Button', 'Defrost Mode', 'Double Ding', 'Inverter Tech', 'Combi Microwave', 'Quantum Reheat', 'Microwave Array', 'Time-Bending Ding', 'Microwave of Babel', 'Radioactive Ding'],
  kettlebell: ['Fresh Oil', 'Double Basket', 'Batter Station', 'Triple Fry', 'Tempura Mastery', 'Everything Fried', 'Oil Waterfall', 'Fry Cathedral', 'Golden Crunch', 'The Bottomless Fryer', 'Brimstone Fryer'],
  bench: ['Clean Grates', 'Cast-Iron Grates', 'Charcoal Upgrade', 'Hickory Smoke', 'Perfect Grill Marks', 'Rotisserie', 'Six-Burner Beast', 'Smoke Signals', 'Grill of the Ancients', 'Eternal Embers', 'Grill of the Damned'],
  squat: ['Pizza Stone', 'Wood Fire', 'Neapolitan Dome', 'Spinning Peel', 'Double-Decker Oven', 'Leopard Crust', 'Thousand-Degree Dome', 'Pizza Sauna', 'Oven of Eternity', 'Dough Singularity', 'Pizza Oven of Hades'],
  trainer: ['Sharp Shoes', 'Clean Apron', 'Loud "Heard!"', 'Two Pans at Once', 'Four Pans at Once', 'Ambidextrous', 'Never Burns Anything', 'Unflappable', 'Line Legend', 'Eight Arms', 'Demon Line Cook'],
  buddy: ['Rubber Gloves', 'Industrial Sprayer', 'Rack System', 'Steam Tunnel', 'Shift Bonus', 'Dish Pit Anthems', 'Zero Broken Plates', 'Spotless Legion', 'Bubble Monks', 'Plate Whisperers', 'Hellhound Scrubbers'],
  mealprep: ['Door Seal Fixed', 'Labelled Shelves', 'Deep Chill', 'Flash Freeze', 'Blast Chiller', 'Arctic Wing', 'Glacier Room', 'Permafrost Pantry', 'Absolute Zero', 'Cryo Vault', 'Frozen Circle of Hell'],
  supps: ['Pipettes', 'Pepper Garden', 'Fermentation Tanks', 'Ghost Pepper Wing', 'Reaper Reserve', 'Scream Tester', 'Lava Distillery', 'Plasma Sauce', 'Forbidden Bottle', 'Sauce of Ruin', 'Hellfire Hot Sauce'],
  homegym: ['Neon Sign', 'Bottomless Coffee', 'Jukebox', 'Pancake Stack', 'Midnight Specials', 'Vinyl Booths', '24/7/365', 'Diner of Legend', 'Timeless Diner', 'Diner at the End of Time', 'Diner of the Lost Souls'],
  lab: ['Safety Goggles', 'Liquid Nitrogen', 'Spherification', 'Edible Foam', 'Sous-Vide Array', 'Flavour Particle', 'Gastro-Collider', 'Taste Synthesiser', 'Quantum Soup', 'Matter Kitchen', 'Alchemy of Hell'],
  club: ['Linen Tablecloths', 'Silver Cloches', 'Wine Cellar', 'Tasting Menu', 'Star Review', 'Twelve-Course Menu', 'Waiting List: 2 Years', 'Napkin Origami', 'Golden Cutlery', 'Restaurant of Legend', 'Six-Star Inferno'],
  camp: ['Folding Tables', 'Refrigerated Vans', 'Wedding Season', 'Royal Banquet', 'Summit Contract', 'Stadium Catering', 'Airline Meals', 'Space Station Lunch', 'Planetary Picnic', 'Feast of Nations', 'Banquet of the Damned'],
  chain: ['Logo Redesign', 'Drive-Thru', 'Mascot', 'Loyalty App', 'National Expansion', 'Global Menu', 'Corner of Every Street', 'Franchise Monopoly', 'One Brand Planet', 'Franchise Hivemind', 'Franchise of Hell'],
  olympic: ['Food Stalls', 'Tasting Tickets', 'Main Stage Chef', 'Fireworks Finale', 'Week-Long Feast', 'International Pavilion', 'Million Visitors', 'Festival Nation', 'Eternal Festival', 'World Feast', 'Festival of Flames'],
  moon: ['Heat Shield', 'Lava Grill', 'Magma Pizza', 'Eruption Timer', 'Obsidian Pans', 'Pyroclastic Bake', 'Caldera Kitchen', 'Volcano Chain', 'Core Tap', 'Tectonic Kitchen', 'Ring of Fire'],
  galaxy: ['Imp Waiters', 'Brimstone Burners', 'Soul Stock', 'Sulfur Spice', 'Demon Brigade', 'Hellfire Wok', 'Nine Circles Menu', 'Devil\'s Tasting', 'Inferno Throne', 'Lord of the Ovens', 'Kitchen Hell'],
};
BUILDINGS.forEach(b => TIERS.forEach(([req, mult], t) => addUpg({
  id: `${b.id}_t${t}`, kind: 'building', icon: b.icon, badge: ROMAN[t + 1], name: TIER_NAMES[b.id][t], cost: b.cost * mult,
  desc: `${b.pl} produce twice as much.${b.id === 'pushups' && t < 3 ? ' Clicks are twice as strong too.' : ''}`,
  req: `Own ${req} ${bName(b, req)}`, unlock: () => own(b.id) >= req,
})));

// Knives & Tools
const GRIP = [['Wooden Spoon', '🥄', 100, 10], ['Balloon Whisk', '🌀', 1e4, 100], ['Meat Cleaver', '🪓', 1e6, 500],
  ['Pizza Cutter', '🍕', 1e8, 1500], ['Damascus Knife', '🗡️', 1e10, 4000]];
GRIP.forEach(([name, icon, cost, clicks], k) => addUpg({
  id: 'grip' + k, kind: 'click', name, icon, cost, desc: 'Clicks are twice as strong.',
  req: `Cook ${clicks} times`, unlock: () => S.clicks >= clicks,
}));

const FOCUS = [['Mise en Place', '🎯'], ['Taste as You Go', '👅'], ['Breathe Through the Rush', '🌬️'], ['Plate Vision', '👁️'],
  ['In the Weeds, Calmly', '🌿'], ['Perfect Sear', '💯'], ['Order Telepathy', '🔮'], ['Chef\'s Kiss', '💋']];
FOCUS.forEach(([name, icon], k) => {
  const cost = 5e4 * 100 ** k;
  addUpg({
    id: 'focus' + k, kind: 'click', name, icon, cost, desc: 'Each click also earns 1.2% of your steaks per second.',
    req: `Earn ${fmt(cost / 10)} steaks from cooking`, unlock: () => S.clickEarned >= cost / 10,
  });
});

const MEMORY_MULTS = [3, 5, 5, 5, 5];
[25, 50, 100, 150, 200, 250].forEach((n, k) => addUpg({
  id: 'mem' + k, kind: 'click', name: `Kitchen Reflexes ${ROMAN[k]}`, icon: '🤹', cost: 1e5 * 100 ** k,
  desc: k === 0 ? 'Clicks and Burnt Toasters earn +0.12 for every building you own that isn\'t a Burnt Toaster.'
    : `Multiplies the Kitchen Reflexes bonus by ${MEMORY_MULTS[k - 1]}.`,
  req: `Own ${n} Burnt Toasters`, unlock: () => own('pushups') >= n,
}));

// Line Cook training: line cooks get stronger, and the target building gets +1% per N line cooks.
const PROGRAM_TARGETS = BUILDINGS.filter(b => !['pushups', 'dumbbells', 'trainer'].includes(b.id));
const programN = b => Math.max(1, BUILDINGS.indexOf(b) - 2);
PROGRAM_TARGETS.forEach(b => addUpg({
  id: 'prog_' + b.id, kind: 'synergy', icon: '🎩', badge: b.icon, name: `${b.name} Training`, cost: Math.max(b.cost * 50, B_BY_ID.trainer.cost * 3),
  desc: `Line Cooks produce 25% more. ${b.pl} gain +1% for every ${programN(b) === 1 ? 'Line Cook' : programN(b) + ' Line Cooks'}.`,
  req: `Own 1 Line Cook and 15 ${b.pl}`, unlock: () => own('trainer') >= 1 && own(b.id) >= 15,
}));

// Kitchen Combos: the bigger building gets +1% per smaller one, the smaller gets +0.15% per bigger one.
const PAIRS = [
  ['pushups', 'pullup', 'Breakfast Rush'], ['dumbbells', 'homegym', 'Short-Order Classics'], ['pullup', 'kettlebell', 'Reheat & Refry'],
  ['kettlebell', 'camp', 'Party Platters'], ['bench', 'squat', 'Fire & Stone'], ['squat', 'lab', 'Deconstructed Pizza'],
  ['trainer', 'club', 'Brigade Drills'], ['buddy', 'club', 'Spotless Service'], ['mealprep', 'supps', 'Hot & Cold'],
  ['supps', 'lab', 'Spherified Sriracha'], ['homegym', 'chain', 'Diner Blueprint'], ['camp', 'olympic', 'Festival Contracts'],
  ['chain', 'moon', 'Lava-Side Locations'], ['olympic', 'galaxy', 'Feast of the Damned'],
];
PAIRS.forEach(([a, b, name], k) => [[15, 'cross', ''], [75, 'cross2', 'Advanced ']].forEach(([n, gate, pre], s) => {
  const A = B_BY_ID[a], Bb = B_BY_ID[b];
  addUpg({
    id: `pair${s}_${k}`, kind: 'synergy', icon: Bb.icon, badge: A.icon, name: pre + name, cost: (A.cost + Bb.cost) * (s ? 5e4 : 100),
    desc: `${Bb.pl} gain +1% for each ${A.name}. ${A.pl} gain +0.15% for each ${Bb.name}.`,
    req: `Own ${n} ${A.pl} and ${n} ${Bb.pl} (needs the ${PERK_BY_ID[gate].name} perk)`,
    unlock: () => perk(gate) > 0 && own(a) >= n && own(b) >= n,
  });
}));

// Ingredients (internal name: foods)
const FOODS = [
  ['Day-Old Bread', '🥖'], ['Farm Eggs', '🥚'], ['Bananas', '🍌'], ['Garlic', '🧄'], ['Real Butter', '🧈'],
  ['Peanuts', '🥜'], ['Catch of the Day', '🐟'], ['Carrots', '🥕'], ['Aged Cheese', '🧀'], ['Smoked Bacon', '🥓'],
  ['Vine Tomatoes', '🍅'], ['Wild Mushrooms', '🍄'], ['Blueberries', '🫐'], ['Lemons', '🍋'], ['Sweet Corn', '🌽'],
  ['Potatoes', '🥔'], ['Avocados', '🥑'], ['Dark Chocolate', '🍫'], ['Wildflower Honey', '🍯'], ['Broccoli', '🥦'],
  ['Jasmine Rice', '🍚'], ['Tiger Shrimp', '🍤'], ['Fresh Milk', '🥛'], ['Strawberries', '🍓'], ['Coconuts', '🥥'],
  ['Stone-Ground Flour', '🌾'], ['Cherries', '🍒'], ['Grapes', '🍇'], ['Pineapple', '🍍'], ['Wagyu Beef', '🥩'],
  // Gated behind the Grandma's Recipes perk
  ['Pelmeni', '🥡'], ['Borscht', '🥣'], ['Plov', '🍛'], ['Shawarma', '🌯'], ['Golubtsy', '🥬'],
  ['Blini', '🥞'], ['Kompot', '🍹'], ['Mom\'s Cutlets', '🍖'], ['Olivier Salad', '🥗'], ['Grandma\'s Secret Love', '💝'],
];
const FOOD_PCT = k => 3 + Math.floor(k / 10);
FOODS.forEach(([name, icon], k) => {
  const cost = 1e5 * 4 ** k, gated = k >= 30;
  addUpg({
    id: 'food' + k, kind: 'food', name, icon, cost, desc: `+${FOOD_PCT(k)}% steaks per second.`,
    req: `Earn ${fmt(cost / 4)} steaks this run${gated ? ' (needs the Grandma\'s Recipes perk)' : ''}`,
    unlock: () => S.runEarned >= cost / 4 && (!gated || perk('recipes') > 0),
  });
});

// Hospitality (internal name: recovery): each multiplies steaks/sec by (1 + Reputation × k). Reputation = 2% per regular achievement.
const RECOVERY = [['Clean Towels', '🧽', 0.1, 5], ['Soft Music', '🎵', 0.1, 15], ['Candlelit Tables', '🕯️', 0.12, 30],
  ['Warm Bread Basket', '🧺', 0.12, 50], ['Friendly Waiters', '👌', 0.14, 75], ['Fresh Roses', '🌹', 0.14, 100], ['Complimentary Tea', '🫖', 0.16, 125],
  ['Comfy Chairs', '🪑', 0.16, 150], ['Live Piano', '🎹', 0.18, 175],
  // Gated behind the Concierge Desk perk
  ['Valet Parking', '🔑', 0.18, 200], ['Sommelier', '🍷', 0.2, 225], ['Standing Ovation', '👏', 0.2, 250]];
RECOVERY.forEach(([name, icon, k, n], i) => {
  const gated = i >= 9;
  addUpg({
    id: 'rec' + i, kind: 'recovery', name, icon, cost: 5e4 * 60 ** i,
    desc: `+${(k * 2).toFixed(2).replace(/0$/, '')}% steaks per second for every achievement you have.`,
    req: `Unlock ${n} achievements${gated ? ' (needs the Concierge Desk perk)' : ''}`,
    unlock: () => regularAchCount() >= n && (!gated || perk('physio') > 0),
  });
});

[['Bamboo Steamer', '🎋', 5e6, 5, 'Golden dumplings appear twice as often.'],
 ['Fortune Cookie', '🥠', 5e8, 20, 'Golden dumpling effects last twice as long.'],
 ['Sticky Rice Magnet', '🧲', 5e10, 60, 'Golden dumplings stay on screen twice as long.'],
 ['Lucky Cat', '🐈', 5e12, 150, 'Tip Jars pay up to 18 minutes of production (instead of 12).'],
 ['Rain Dance', '⛈️', 5e14, 250, 'Dumpling Rain is twice as likely.']]
  .forEach(([name, icon, cost, n, desc], k) => addUpg({
    id: 'shk' + k, kind: 'special', name, icon, cost, desc, req: `Catch ${n} golden dumplings`, unlock: () => S.shakers >= n,
  }));
// Supplier deals (internal name: discounts)
[['Farm Handshake', '🐄', 1e5, 50], ['Loyalty Card', '💳', 1e9, 200], ['Container Ship', '🚢', 1e13, 500]]
  .forEach(([name, icon, cost, n], k) => addUpg({
    id: 'disc' + k, kind: 'special', name, icon, cost, desc: 'All buildings are 5% cheaper.',
    req: `Own ${n} buildings in total`, unlock: () => totalOwned() >= n,
  }));
const UPG_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// ---------- State ----------
const SAVE_KEY = 'kitchenHell_v1';
const SCOOP_UNLOCK = 1e9;
const defaultState = () => ({
  gymName: 'Dima',
  gains: 0, runEarned: 0, lifeEarned: 0, clickEarned: 0,
  clicks: 0, runClicks: 0, crits: 0, shakers: 0, soldTotal: 0, newsClicks: 0, missStreak: 0,
  split: 'full', splitTime: 0, splitsTried: ['full'], chains: 0, bestChain: 0,
  prestiges: 0, medals: 0, medalsSpent: 0, perks: {}, lockers: [],
  owned: {}, upg: [], muscles: {}, ach: [], records: {}, flags: {},
  scoops: 0, scoopTime: 0, blevels: {},
  bestStage: 0, legendRank: 0, playTime: 0, runTime: 0,
  lastSave: Date.now(), muted: false,
  ext: {}, // per-extension saved state, see extState()
});
let S = defaultState();
let U = new Set();      // bought upgrade ids, mirrors S.upg
let achSet = new Set(); // unlocked achievement ids, mirrors S.ach
const R = { chain: 0, buffs: [], nextShaker: 0, autoAcc: 0, slowAcc: 0, clickTimes: [], lastClick: Date.now() };
let clock = () => Date.now();
const Hooks = { stage() {}, legend() {}, achievement() {}, spawnShaker() {}, storm() {}, autoClick() {}, scoop() {} };

const own = id => S.owned[id] || 0;
const lvl = id => S.muscles[id] || 0;
const perk = id => S.perks[id] || 0;
const rec = id => S.records[id] || 0;
const blevel = id => S.blevels[id] || 0;
const totalOwned = () => BUILDINGS.reduce((n, b) => n + own(b.id), 0);
const totalRecords = () => LIFTS.reduce((n, l) => n + rec(l.id), 0);
const totalBLevels = () => BUILDINGS.reduce((n, b) => n + blevel(b.id), 0);
const mainComplete = () => S.bestStage >= STAGES.length - 1;

// ---------- Formulas ----------
const medalRate = () => perk('bigsponsor') ? 0.06 : perk('sponsor') ? 0.045 : 0.03;
// Stars (internal name: medals) past 1,000 count with square-root strength so the endless phase can't run away.
const MEDAL_SOFTCAP = 1000;
const effectiveMedals = () => S.medals <= MEDAL_SOFTCAP ? S.medals : MEDAL_SOFTCAP * Math.sqrt(S.medals / MEDAL_SOFTCAP);
function allMult() {
  return (1 + medalRate() * effectiveMedals()) * (1 + 0.1 * perk('discipline')) * (perk('card') ? 1.05 : 1) * 1.02 ** rec('deadlift');
}
function foodMult() { let m = 1; FOODS.forEach((f, k) => { if (U.has('food' + k)) m *= 1 + FOOD_PCT(k) / 100; }); return m; }
const fitness = () => regularAchCount() * 0.02;
function recoveryMult() {
  let m = 1;
  RECOVERY.forEach((r, k) => { if (U.has('rec' + k)) m *= 1 + fitness() * r[2]; });
  return m;
}
const splitGps = () => ({ push: 0.85, cardio: 0.9, rest: 1.25 })[split()] || 1;
function gpsMult() {
  // 1.3: the kitchen's base efficiency, replacing the average boost the old Heat meter gave.
  return 1.3 * extMul('gps') * splitGps() * allMult() * foodMult() * recoveryMult() * (1 + 0.05 * lvl('chest')) * 1.04 ** rec('bench') * (1 + 0.1 * S.legendRank);
}
function tierMult(b) { let m = 1; for (let t = 0; t < TIERS.length; t++) if (U.has(`${b.id}_t${t}`)) m *= 2; return m; }
function memoryBonus() {
  if (!U.has('mem0')) return 0;
  let per = 0.12;
  MEMORY_MULTS.forEach((x, k) => { if (U.has('mem' + (k + 1))) per *= x; });
  return per * (totalOwned() - own('pushups'));
}
function synergyMult(b) {
  let m = 1;
  if (b.id === 'trainer') PROGRAM_TARGETS.forEach(t => { if (U.has('prog_' + t.id)) m *= 1.25; });
  if (U.has('prog_' + b.id)) m *= 1 + 0.01 * Math.floor(own('trainer') / programN(b));
  PAIRS.forEach(([a, big], k) => {
    for (let s = 0; s < 2; s++) {
      if (!U.has(`pair${s}_${k}`)) continue;
      if (b.id === big) m *= 1 + 0.01 * own(a);
      if (b.id === a) m *= 1 + 0.0015 * own(big);
    }
  });
  return m;
}
function buildingBase(b) {
  return b.gps * tierMult(b) * synergyMult(b) * (1 + 0.01 * blevel(b.id)) + (b.id === 'pushups' ? memoryBonus() : 0);
}
const buildingEach = b => buildingBase(b) * gpsMult();
function rawGps() { return BUILDINGS.reduce((g, b) => g + own(b.id) * buildingBase(b), 0); }
const baseGps = () => rawGps() * gpsMult();
function buffMult(type) { return R.buffs.reduce((m, b) => (b.type === type ? m * b.mult : m), 1); }
function gps() { return baseGps() * buffMult('gps'); }
function clickBase() {
  let c = 1 + memoryBonus();
  GRIP.forEach((g, k) => { if (U.has('grip' + k)) c *= 2; });
  for (let t = 0; t < 3; t++) if (U.has('pushups_t' + t)) c *= 2;
  let pct = 0;
  FOCUS.forEach((f, k) => { if (U.has('focus' + k)) pct += 0.012; });
  if (perk('steady')) pct += 0.01;
  return c * extMul('click') * (({ push: 2, rest: 0.25 })[split()] || 1) * (1 + 0.1 * lvl('arms')) * allMult() * 1.06 ** rec('squat') + baseGps() * pct;
}
function clickPower() { return clickBase() * buffMult('click'); }
const critChance = () => 0.02 + 0.01 * lvl('legs');
function costMult() {
  let m = split() === 'cardio' ? 0.9 : 1;
  for (let k = 0; k < 3; k++) if (U.has('disc' + k)) m *= 0.95;
  if (perk('coupon')) m *= 0.97;
  if (perk('wholesale')) m *= 0.95;
  return m * extMul('cost') * Math.max(0.5, 0.99 ** rec('ohp'));
}
const upgCost = u => u.cost * (perk('member') ? 0.95 : 1);
const PRICE_GROWTH = 1.14;
function buildingCost(b, n = 1, from = own(b.id)) { return Math.ceil(b.cost * costMult() * PRICE_GROWTH ** from * (PRICE_GROWTH ** n - 1) / (PRICE_GROWTH - 1)); }
function sellValue(b, n) { n = Math.min(n, own(b.id)); return n > 0 ? buildingCost(b, n, own(b.id) - n) * 0.3 : 0; }
function maxAffordable(b) {
  return Math.max(0, Math.floor(Math.log(S.gains * (PRICE_GROWTH - 1) / buildingCost(b, 1) + 1) / Math.log(PRICE_GROWTH)));
}
const muscleCost = m => m.base * 5 ** lvl(m.id);
const recordCost = l => l.base * l.growth ** rec(l.id);
const recordWeight = (l, n = rec(l.id)) => l.start + l.step * n;
const medalsFor = life => Math.floor(Math.cbrt(life / 1e6));
const pendingMedals = () => Math.max(0, medalsFor(S.lifeEarned) - S.medals);
const medalsAvailable = () => S.medals - S.medalsSpent;
const nextMedalAt = () => (medalsFor(S.lifeEarned) + 1) ** 3 * 1e6;
const perkCost = p => p.repeat ? Math.ceil(p.cost * 1.6 ** perk(p.id)) : p.cost;
const perkUnlocked = p => p.req.every(r => perk(r) > 0);
const lockerSlots = () => [1, 2, 3, 4, 5].filter(i => perk('locker' + i)).length;
const legendTarget = r => STAGES[STAGES.length - 1].at * LEGEND_STEP ** r;
const scoopsUnlocked = () => S.lifeEarned >= SCOOP_UNLOCK;
const scoopInterval = () => 2 * 3600 * 1000 / (perk('scoopfast') ? 1.25 : 1);
const blevelCost = b => blevel(b.id) + 1;
function availableUpgrades() { return UPGRADES.filter(u => !U.has(u.id) && u.unlock() && extAll('allowUpgrade', u)).sort((a, b) => upgCost(a) - upgCost(b)); }

// ---------- Actions ----------
function earn(v) { S.gains += v; S.runEarned += v; S.lifeEarned += v; }

function click(auto = false) {
  let v = clickPower();
  const crit = Math.random() < critChance();
  if (crit) { v *= split() === 'legs' ? 8 : 5; S.crits++; }
  else if (split() === 'legs') v *= 0.8;
  earn(v);
  S.clickEarned += v;
  S.clicks++;
  if (!auto) {
    S.runClicks++;
    const t = clock();
    R.lastClick = t;
    R.clickTimes.push(t);
    while (R.clickTimes[0] < t - 1000) R.clickTimes.shift();
    if (R.clickTimes.length >= 15) S.flags.speed = true;
    if (R.clickTimes.length >= 25) S.flags.hyper = true;
  }
  return { v, crit };
}

function buyBuilding(b, n) {
  if (!extAll('allowBuilding', b)) return false;
  if (n === 'max') n = maxAffordable(b);
  while (n > 0 && buildingCost(b, n) > S.gains) n--;
  if (n < 1) return false;
  S.gains -= buildingCost(b, n);
  S.owned[b.id] = own(b.id) + n;
  return true;
}
function sellBuilding(b, n) {
  if (n === 'max') n = own(b.id);
  n = Math.min(n, own(b.id));
  if (n < 1) return false;
  S.gains += sellValue(b, n);
  S.owned[b.id] = own(b.id) - n;
  S.soldTotal += n;
  S.flags.sold = true;
  return true;
}
function buyUpgrade(id) {
  const u = UPG_BY_ID[id];
  if (!u || U.has(id) || S.gains < upgCost(u) || !u.unlock()) return false;
  S.gains -= upgCost(u);
  S.upg.push(id);
  U.add(id);
  return true;
}
function trainMuscle(m) {
  if (lvl(m.id) >= MUSCLE_MAX || S.gains < muscleCost(m)) return false;
  S.gains -= muscleCost(m);
  S.muscles[m.id] = lvl(m.id) + 1;
  return true;
}
function setRecord(l) {
  if (!mainComplete() || S.gains < recordCost(l)) return false;
  S.gains -= recordCost(l);
  S.records[l.id] = rec(l.id) + 1;
  return true;
}
function levelBuilding(b) {
  if (S.scoops < blevelCost(b)) return false;
  S.scoops -= blevelCost(b);
  S.blevels[b.id] = blevel(b.id) + 1;
  return true;
}
function buyPerk(p) {
  if ((!p.repeat && perk(p.id)) || !perkUnlocked(p) || medalsAvailable() < perkCost(p)) return false;
  S.medalsSpent += perkCost(p);
  S.perks[p.id] = perk(p.id) + 1;
  return true;
}
function setSplit(id) {
  if (!splitsUnlocked() || !SPLIT_BY_ID[id] || id === S.split || splitCooldown() > 0) return false;
  S.split = id;
  S.splitTime = Date.now();
  if (!S.splitsTried.includes(id)) S.splitsTried.push(id);
  return true;
}
const splitCooldown = () => Math.min(SPLIT_COOLDOWN, Math.max(0, SPLIT_COOLDOWN - (Date.now() - S.splitTime) / 1000));
function setLocker(slot, id) {
  if (slot >= lockerSlots() || (id && !U.has(id))) return false;
  if (id && S.lockers.some((x, i) => x === id && i !== slot)) return false;
  S.lockers[slot] = id || null;
  return true;
}
function compete() {
  const p = pendingMedals();
  if (p < 1) return 0;
  if (S.upg.length === 0) S.flags.rawTalent = true;
  S.medals += p;
  S.prestiges++;
  const kept = {};
  if (perk('memory')) for (const [k, v] of Object.entries(S.muscles)) kept[k] = Math.floor(v / 4);
  const lockers = [...new Set(S.lockers.slice(0, lockerSlots()).filter(id => id && U.has(id)))];
  if (lockers.length) S.flags.lockerUsed = true;
  Object.assign(S, { gains: 0, runEarned: 0, runClicks: 0, owned: {}, upg: lockers.slice(), muscles: kept, runTime: 0 });
  U = new Set(S.upg);
  R.buffs = []; R.chain = 0;
  if (perk('headstart')) Object.assign(S.owned, { pushups: 10, dumbbells: 5 });
  if (perk('starterkit')) BUILDINGS.slice(0, 6).forEach(b => { S.owned[b.id] = Math.max(own(b.id), 10); });
  if (perk('savings')) S.gains = 1000 * S.medals;
  extEach('compete', p);
  return p;
}

// ---------- Golden dumplings (internal name: shakers) ----------
function shakerDelay() {
  let d = rand(120, 360) * 1000;
  if (U.has('shk0')) d /= 2;
  if (perk('lucky')) d /= 1.15;
  if (split() === 'pull') d /= 1.3;
  return d * 0.95 ** lvl('back') / extMul('shakerRate');
}
const shakerStay = () => 12000 * (U.has('shk2') ? 2 : 1) * (perk('goldtouch') ? 1.5 : 1);
function addBuff(type, mult, sec, name) {
  const dur = sec * 1000 * extMul('buffDur') * (U.has('shk1') ? 2 : 1) * (perk('streak') ? 1.2 : 1) * (split() === 'pull' ? 0.8 : 1) * (1 + 0.03 * lvl('core'));
  // The same buff refreshes its timer instead of stacking.
  const same = R.buffs.find(b => b.name === name);
  if (same) Object.assign(same, { until: clock() + dur, dur });
  else R.buffs.push({ type, mult, until: clock() + dur, dur, name });
}
function luckyAmount(share = 1) {
  const minutes = U.has('shk3') ? 18 : 12;
  return (Math.min(S.gains * 0.12, baseGps() * minutes * 60) + 10) * share;
}
function claimShaker() {
  S.shakers++;
  S.missStreak = 0;
  const special = extFirst('shaker');
  if (special) return special;
  const busy = BUILDINGS.filter(b => own(b.id) >= 10);
  const stormChance = 0.012 * (U.has('shk4') ? 2 : 1) * (perk('rain') ? 3 : 1);
  let r = Math.random();
  if (r < stormChance) {
    S.flags.storm = true;
    Hooks.storm(12);
    return { title: 'Dumpling Rain!', text: 'Grab as many as you can before they go cold.' };
  }
  if (R.chain > 0 || Math.random() < 0.08) return chainShaker();
  r = Math.random();
  if (r < 0.40) {
    const v = luckyAmount();
    earn(v);
    return { title: 'Tip Jar!', text: `A generous customer left +${fmt(v)} steaks.` };
  }
  if (r < 0.80) {
    addBuff('gps', 6, 70, 'Dinner Rush ×6');
    return { title: 'Dinner Rush!', text: 'Steaks per second ×6 for 70 seconds.' };
  }
  if (r < 0.90 && busy.length) {
    const b = busy[Math.floor(Math.random() * busy.length)];
    const mult = 1 + Math.min(own(b.id), 120) * 0.08;
    addBuff('gps', mult, 35, `Overbooked ${b.pl} ×${fmt(mult)}`);
    return { title: `Overbooked ${b.pl}!`, text: `Steaks per second ×${fmt(mult)} for 35 seconds.` };
  }
  if (r < 0.97) {
    addBuff('click', 80, 12, 'Adrenaline ×80');
    return { title: 'Adrenaline!', text: 'Clicks ×80 for 12 seconds. Cook fast!' };
  }
  if (scoopsUnlocked()) {
    S.scoops++;
    return { title: 'Sourdough loaf!', text: 'The dumpling was hiding a fresh sourdough loaf.' };
  }
  const v = luckyAmount();
  earn(v);
  return { title: 'Tip Jar!', text: `A generous customer left +${fmt(v)} steaks.` };
}
// Second Helping: dumplings come back fast, each one paying more, until the chain breaks.
const CHAIN_MAX = 7;
function chainShaker() {
  R.chain++;
  S.bestChain = Math.max(S.bestChain, R.chain);
  if (R.chain === 1) S.chains++;
  const v = luckyAmount(0.05 * 1.6 ** R.chain);
  earn(v);
  const link = R.chain;
  if (R.chain < CHAIN_MAX && Math.random() < 0.75) {
    R.nextShaker = clock() + 2500;
    return { title: `Second helping! Plate ${link}`, text: `+${fmt(v)} steaks. Another dumpling is coming, grab it.` };
  }
  R.chain = 0;
  return { title: `Plate ${link}, last plate`, text: `+${fmt(v)} steaks. The kitchen is out of dumplings.` };
}
// Small dumplings from a Dumpling Rain: each pays a little.
function claimStormShaker() {
  const v = Math.min(S.gains * 0.01, baseGps() * 60) + 10;
  earn(v);
  return v;
}
function missShaker(chainLink = false) {
  if (chainLink) R.chain = 0;
  S.missStreak++; if (S.missStreak >= 20) S.flags.missed = true; }

// ---------- Achievements ----------
// tier (1–5) is the difficulty within a series, drawn as a bronze/silver/gold/ruby/diamond rim.
const ACH = [];
const ach = (cat, id, name, icon, desc, test, shadow = false, tier = shadow ? 3 : 2) =>
  ACH.push({ cat, id, name, icon, desc, test, shadow, tier: Math.max(1, Math.min(5, Math.round(tier))) });
// Spreads a series of n achievements over tiers 1..5, and picks an icon from a list by position.
const tierOf = (i, n) => (n < 2 ? 3 : 1 + Math.round(i * 4 / (n - 1)));
const iconOf = (icons, i, n) => icons[Math.min(icons.length - 1, Math.floor(i * icons.length / n))];
const series = (cat, list, idOf, icons, descOf, testOf) => list.forEach(([n, name], i) =>
  ach(cat, idOf(n), name, iconOf(icons, i, list.length), descOf(n), testOf(n), false, tierOf(i, list.length)));
// Cached because Reputation is read inside every production calculation.
let regularAch = 0;
const regularAchCount = () => regularAch;
const recountAch = () => { regularAch = S.ach.reduce((n, id) => n + (ACH_BY_ID[id] && !ACH_BY_ID[id].shadow ? 1 : 0), 0); };

series('Cooking', [[1, 'First Flip'], [100, 'Warmed-Up Pan'], [500, 'Getting the Hang of It'], [1000, 'Short-Order Wrist'], [5000, 'Iron Wrist'],
  [10000, 'Ten Thousand Flips'], [25000, 'Tireless Spatula'], [50000, 'Relentless Sizzle'], [100000, 'Hundred Thousand Flips'], [250000, 'Wrist of the Inferno']],
  n => 'clicks' + n, ['👆', '🍳', '🧤', '🔥', '👊'], n => `Cook ${fmt(n)} time${n === 1 ? '' : 's'}.`, n => () => S.clicks >= n);
series('Cooking', [[1e3, 'Hands-On'], [1e6, 'Hard Worker'], [1e9, 'Busy Hands'], [1e12, 'Heavy Hitter'], [1e15, 'Unstoppable Hands'],
  [1e18, 'Legendary Ladle'], [1e21, 'Mythic Spatula'], [1e24, 'Hands of a Kitchen God']],
  n => 'clickEarn' + n, ['✋', '🥄', '🍴', '💆', '🙌'], n => `Earn ${fmt(n)} steaks from cooking.`, n => () => S.clickEarned >= n);
series('Cooking', [[1, 'Lucky Flip'], [100, 'Sharp Cut'], [1000, 'Critical Sear'], [10000, 'Teppanyaki Master']],
  n => 'crit' + n, ['💥', '✴️', '🎆', '☄️'], n => `Land ${fmt(n)} critical click${n === 1 ? '' : 's'}.`, n => () => S.crits >= n);
series('Steaks', [[1e3, 'First Customer'], [1e4, 'Word of Mouth'], [1e5, 'Steady Orders'], [1e6, 'Millionaire Menu'], [1e7, 'Committed Kitchen'],
  [1e8, 'Serious Chef'], [1e9, 'Billion Bites'], [1e10, 'Ten Billion Plates'], [1e11, 'Hundred Billion Plates'], [1e12, 'Trillion Club'],
  [1e15, 'Feeding the Nation'], [1e18, 'Feeding the Planet'], [1e21, 'Beyond Hunger'], [1e24, 'Mythical Menu'], [1e27, 'Astronomical Appetite'],
  [1e30, 'Cosmic Cuisine'], [1e33, 'Endless Buffet']],
  n => 'life' + n, ['💰', '🪙', '🤑', '💎', '👑'], n => `Cook ${fmt(n)} steaks in total.`, n => () => S.lifeEarned >= n);
series('Steaks', [[1, 'Passive Income'], [10, 'Routine'], [100, 'Kitchen Habit'], [1e3, 'Lifestyle'], [1e4, 'Momentum'], [1e5, 'Well-Oiled Kitchen'],
  [1e6, 'Million per Second'], [1e7, 'Steak Factory'], [1e8, 'Industry'], [1e9, 'Billion per Second'], [1e10, 'Force of Nature'],
  [1e12, 'Unreal'], [1e15, 'Cosmic Kitchen'], [1e18, 'Galactic Kitchen'], [1e21, 'Universal Chef']],
  n => 'gps' + n, ['⏱️', '⏲️', '⚙️', '🏭', '🌪️'], n => `Make ${fmt(n)} steaks per second.`, n => () => baseGps() >= n);
series('Steaks', [[1e6, 'Piggy Bank'], [1e9, 'Saving Up'], [1e12, 'Rainy Day Fund'], [1e15, 'Steak Vault']],
  n => 'bank' + n, ['🐷', '🏦', '💼', '🏧'], n => `Have ${fmt(n)} steaks in the bank at once.`, n => () => S.gains >= n);

const OWN_TITLES = [[1, 'Rookie'], [50, 'Regular'], [100, 'Enthusiast'], [150, 'Expert'], [200, 'Master'], [300, 'Maestro'], [400, 'Legend']];
BUILDINGS.forEach(b => OWN_TITLES.forEach(([n, t], i) =>
  ach('Kitchen', `own_${b.id}_${n}`, `${b.name} ${t}`, b.icon, `Own ${n} ${bName(b, n)}.`, () => own(b.id) >= n, false, tierOf(i, OWN_TITLES.length))));
series('Kitchen', [[1, 'Full Kitchen'], [10, 'Well Stocked'], [50, 'Balanced Kitchen'], [100, 'Century Kitchen'], [150, 'Overflowing'], [200, 'Everything, Twice Over']],
  n => 'every' + n, ['🏬', '🏰'], n => `Own at least ${n} of every building.`, n => () => BUILDINGS.every(b => own(b.id) >= n));
series('Kitchen', [[100, 'Busy Kitchen'], [250, 'Packed Kitchen'], [500, 'Food Empire'], [1000, 'Thousand Appliances'], [2000, 'Industrial Kitchen'], [4000, 'Megakitchen']],
  n => 'total' + n, ['🏗️', '🏭'], n => `Own ${n} buildings in total.`, n => () => totalOwned() >= n);
series('Kitchen', [[1, 'First Feeding'], [10, 'Fine Tuning'], [50, 'Well Maintained'], [100, 'Top Condition']],
  n => 'blev' + n, ['🥯', '🔧'], n => `Reach ${n} total equipment level${n === 1 ? '' : 's'} with sourdough loaves.`, n => () => totalBLevels() >= n);

series('Upgrades', [[10, 'Equipped'], [25, 'Well Equipped'], [50, 'Fully Stocked'], [100, 'Gadget Collector'], [150, 'Gadget Hoarder'], [200, 'Upgrade Addict'], [250, 'Nearly Everything']],
  n => 'upg' + n, ['🧰', '🔧', '⚙️'], n => `Own ${n} upgrades at once.`, n => () => S.upg.length >= n);
const kindCount = (prefix, n) => { let c = 0; for (let k = 0; k < n; k++) if (U.has(prefix + k)) c++; return c; };
ach('Upgrades', 'food10', 'Balanced Pantry', '🥗', 'Own 10 Ingredient upgrades.', () => kindCount('food', FOODS.length) >= 10, false, 2);
ach('Upgrades', 'food30', 'Full Pantry', '🧺', 'Own 30 Ingredient upgrades.', () => kindCount('food', FOODS.length) >= 30, false, 3);
ach('Upgrades', 'foodAll', 'Grandma Approves', '💝', 'Own every Ingredient upgrade.', () => kindCount('food', FOODS.length) === FOODS.length, false, 5);
ach('Upgrades', 'recAll', 'Perfect Host', '🛎️', 'Own every Hospitality upgrade.', () => kindCount('rec', RECOVERY.length) === RECOVERY.length, false, 5);
ach('Upgrades', 'prog5', 'Training Program', '🎩', 'Own 5 Line Cook training upgrades.', () => PROGRAM_TARGETS.filter(b => U.has('prog_' + b.id)).length >= 5, false, 3);
ach('Upgrades', 'progAll', 'Head of Training', '🎓', 'Own every Line Cook training upgrade.', () => PROGRAM_TARGETS.every(b => U.has('prog_' + b.id)), false, 5);
ach('Upgrades', 'pair1', 'Better Together', '🔀', 'Own a Kitchen Combo upgrade.', () => PAIRS.some((p, k) => U.has(`pair0_${k}`)), false, 2);
ach('Upgrades', 'pairAll', 'Total Fusion', '🔁', 'Own every Kitchen Combo upgrade.', () => PAIRS.every((p, k) => U.has(`pair0_${k}`) && U.has(`pair1_${k}`)), false, 5);
ach('Upgrades', 'focusAll', 'Zen Chef', '🎯', 'Own every Focus upgrade.', () => kindCount('focus', FOCUS.length) === FOCUS.length, false, 4);

series('Bonuses', [[1, 'Golden Find'], [5, 'High Five'], [20, 'Dumpling Hunter'], [60, 'Golden Habit'], [150, 'Dumpling Collector'], [250, 'Golden Streak'], [600, 'Dumpling Legend']],
  n => 'shaker' + n, ['🥟', '🏮', '🐉'], n => `Catch ${n} golden dumpling${n === 1 ? '' : 's'}.`, n => () => S.shakers >= n);
ach('Bonuses', 'stormed', 'Singing in the Rain', '⛈️', 'Catch a Dumpling Rain.', () => S.flags.storm, false, 4);

ach('Chef Skills', 'mus5', 'Focused', '🔪', 'Train any chef skill to level 5.', () => MUSCLES.some(m => lvl(m.id) >= 5), false, 1);
ach('Chef Skills', 'mus10', 'Specialist', '🧂', 'Train any chef skill to level 10.', () => MUSCLES.some(m => lvl(m.id) >= 10), false, 2);
ach('Chef Skills', 'musAll5', 'Balanced', '⚖️', 'Train every chef skill to level 5.', () => MUSCLES.every(m => lvl(m.id) >= 5), false, 2);
ach('Chef Skills', 'musAll10', 'Well Rounded', '🍱', 'Train every chef skill to level 10.', () => MUSCLES.every(m => lvl(m.id) >= 10), false, 3);
ach('Chef Skills', 'musMax', 'Maxed Out', '👑', `Train any chef skill to level ${MUSCLE_MAX}.`, () => MUSCLES.some(m => lvl(m.id) >= MUSCLE_MAX), false, 4);
ach('Chef Skills', 'musAllMax', 'Complete Chef', '🏆', `Train every chef skill to level ${MUSCLE_MAX}.`, () => MUSCLES.every(m => lvl(m.id) >= MUSCLE_MAX), false, 5);

STAGES.forEach((st, i) => i && ach('Journey', 'stage' + i, st.name, st.icon, `Reach the ${st.name} stage.`, () => S.bestStage >= i, false, tierOf(i - 1, STAGES.length - 1)));
[1, 3, 5, 10, 15].forEach((n, i) => ach('Journey', 'legend' + n, `Inferno Rank ${n}`, ['🌟', '💫', '🌠', '☄️', '🪐'][i], `Reach Inferno rank ${n}.`, () => S.legendRank >= n, false, i + 1));
series('Journey', [[1, 'First Signature'], [10, 'Signature Streak'], [25, 'Record Breaker'], [50, 'Best in Town'], [100, 'World Class'], [250, 'Untouchable']],
  n => 'pr' + n, ['📝', '📜', '🥇'], n => `Perfect signature dishes ${n} time${n === 1 ? '' : 's'} in total.`, n => () => totalRecords() >= n);
LIFTS.forEach(l => ach('Journey', 'lift_' + l.id, `${l.name} Specialist`, l.icon, `Perfect your ${l.name} 10 times.`, () => rec(l.id) >= 10, false, 4));

series('Cook-offs', [[1, 'First Cook-off'], [5, 'Contender'], [10, 'Veteran'], [25, 'Champion'], [50, 'Hall of Fame'], [100, 'Eternal Champion']],
  n => 'comp' + n, ['🏅', '🥇', '🏆'], n => `Enter ${n} cook-off${n === 1 ? '' : 's'}.`, n => () => S.prestiges >= n);
series('Cook-offs', [[10, 'Star Shelf'], [100, 'Star Wall'], [1000, 'Constellation'], [1e5, 'Galaxy of Stars']],
  n => 'medals' + n, ['⭐', '💫', '🌌'], n => `Win ${fmt(n)} stars in total.`, n => () => S.medals >= n);
series('Cook-offs', [[1, 'First Secret'], [10, 'Branching Out'], [PERKS.length, 'Keeper of Secrets']],
  n => 'perks' + n, ['🌱', '🌿', '🌳'], n => `Own ${n} Chef's Secret${n === 1 ? '' : 's'}.`, n => () => Object.keys(S.perks).length >= n);
ach('Cook-offs', 'disc10', 'Yes, Chef!', '📈', 'Reach "Yes, Chef!" level 10.', () => perk('discipline') >= 10, false, 3);
ach('Cook-offs', 'disc25', 'YES, CHEF!', '📈', 'Reach "Yes, Chef!" level 25.', () => perk('discipline') >= 25, false, 5);
ach('Cook-offs', 'locker', 'Secret Recipe', '🗃️', 'Keep an upgrade through a cook-off with the Recipe Box.', () => S.flags.lockerUsed, false, 2);

ach('Special', 'splits', 'Menu Explorer', '📃', 'Try every service style.', () => S.splitsTried.length >= SPLITS.length, false, 2);
ach('Bonuses', 'chain1', 'Second Helping', '⛓️', 'Start a dumpling chain.', () => S.chains >= 1, false, 2);
ach('Bonuses', 'chain5', 'Fifth Helping', '⛓️', 'Reach plate 5 in a dumpling chain.', () => S.bestChain >= 5, false, 3);
ach('Bonuses', 'chainMax', 'All You Can Eat', '🐉', `Finish a full ${CHAIN_MAX}-plate dumpling chain.`, () => S.bestChain >= CHAIN_MAX, false, 5);
ach('Special', 'sold', 'Second Thoughts', '↩️', 'Sell a building.', () => S.flags.sold, false, 1);
ach('Special', 'speed', 'Speed Demon', '🏎️', 'Cook 15 times in one second.', () => S.flags.speed, false, 3);
ach('Special', 'patience', 'Low and Slow', '🧘', 'Go 15 minutes without cooking while still making steaks.', () => S.flags.patience, false, 2);
ach('Special', 'night', 'Midnight Snack', '🌙', 'Play between midnight and 5 AM.', () => S.flags.night, false, 1);
ach('Special', 'named', 'Grand Opening', '🪧', 'Rename your restaurant.', () => S.flags.named, false, 1);
ach('Special', 'minimal', 'Tiny Kitchen', '🪶', 'Cook 1B steaks in one run while owning 50 buildings or fewer.', () => S.runEarned >= 1e9 && totalOwned() <= 50, false, 4);
[[3600, 'Long Shift', '⌛'], [18000, 'Double Shift', '📅'], [86400, 'Never Leaves the Kitchen', '🕰️']]
  .forEach(([n, name, icon], i) => ach('Special', 'time' + n, name, icon, `Play for ${fmtTime(n)} in total.`, () => S.playTime >= n, false, [1, 3, 5][i]));

// Secret achievements: hidden until earned and they don't count toward Reputation.
const secret = (id, name, icon, desc, test, tier = 3) => ach('Secret', id, name, icon, desc, test, true, tier);
secret('hyper', 'Overcaffeinated', '⚡', 'Cook 25 times in one second.', () => S.flags.hyper, 4);
secret('noclick', 'Hands-Off Chef', '😌', 'Cook 5M steaks in a run without touching the steak once.', () => S.runEarned >= 5e6 && S.runClicks === 0, 3);
secret('speedrun', 'Express Service', '⏩', 'Cook 1B steaks within 15 minutes of starting a run.', () => S.runEarned >= 1e9 && S.runTime <= 900, 4);
secret('missed', 'Not Hungry', '🗑️', 'Let 20 golden dumplings in a row go cold.', () => S.flags.missed, 3);
secret('answer', 'The Answer', '🔢', 'Own exactly 42 Burnt Toasters and 42 Rusty Pans.', () => own('pushups') === 42 && own('dumbbells') === 42, 2);
secret('gymrat', 'Kitchen Rat', '🐀', 'Play for 100 hours in total.', () => S.playTime >= 360000, 5);
secret('skipleg', 'Pizza-Free Zone', '🛑', 'Cook 1T steaks in a run without owning a Pizza Oven.', () => S.runEarned >= 1e12 && own('squat') === 0, 4);
secret('news', 'Fake News', '📰', 'Click the news ticker 10 times.', () => S.newsClicks >= 10, 1);
secret('darkpower', 'True Name', '👹', 'Name your restaurant "Kitchen Hell".', () => S.gymName.trim().toLowerCase() === 'kitchen hell', 2);
secret('garage', 'Liquidation Sale', '🏷️', 'Sell 500 buildings in total.', () => S.soldTotal >= 500, 4);
secret('rawtalent', 'Raw Talent', '🥕', 'Enter a cook-off without owning a single upgrade.', () => S.flags.rawTalent, 3);
secret('importer', 'Reheated Leftovers', '🕰️', 'Import a save.', () => S.flags.imported, 1);
const ACH_BY_ID = Object.fromEntries(ACH.map(a => [a.id, a]));
const ACH_CATEGORIES = [...new Set(ACH.map(a => a.cat))];

// ---------- Extensions ----------
// Feature modules (ext/*.js) plug in here without editing the core. A module is an object:
// { id, state() -> default saved state, gps(), click(), cost(), shakerRate(), buffDur() -> multipliers,
//   allowBuilding(b), allowUpgrade(u) -> false to block, tick(dt), slow() once per second,
//   compete(starsWon), shaker() -> optional {title, text} to replace a golden dumpling's normal effect,
//   tab: { label, render(el), update(el) } for its own menu tab }.
const EXT = [];
function registerExt(e) { EXT.push(e); return e; }
function extState(id) {
  const e = EXT.find(x => x.id === id);
  if (!S.ext[id]) S.ext[id] = e && e.state ? e.state() : {};
  return S.ext[id];
}
function extMul(key) { let m = 1; for (const e of EXT) if (e[key]) m *= e[key](); return m; }
function extAll(key, arg) { for (const e of EXT) if (e[key] && e[key](arg) === false) return false; return true; }
function extEach(key, arg) { for (const e of EXT) if (e[key]) e[key](arg); }
function extFirst(key) { for (const e of EXT) { const r = e[key] && e[key](); if (r) return r; } return null; }
// Achievements and upgrades added by modules, kept in the shared lookup tables.
// tier (optional, 1–5) defaults to 2 for regular and 3 for secret achievements.
function extAch(cat, id, name, icon, desc, test, shadow = false, tier) {
  ach(cat, id, name, icon, desc, test, shadow, tier === undefined ? (shadow ? 3 : 2) : tier);
  ACH_BY_ID[id] = ACH[ACH.length - 1];
  if (!ACH_CATEGORIES.includes(cat)) ACH_CATEGORIES.splice(Math.max(0, ACH_CATEGORIES.indexOf('Secret')), 0, cat);
}
function extUpg(u) { addUpg(u); UPG_BY_ID[u.id] = u; }

// ---------- Loop ----------
function updateStage() {
  let s = 0;
  STAGES.forEach((st, i) => { if (S.lifeEarned >= st.at) s = i; });
  if (s > S.bestStage) { S.bestStage = s; Hooks.stage(s); }
  if (mainComplete()) {
    const r = Math.max(0, Math.floor(Math.log10(S.lifeEarned / STAGES[STAGES.length - 1].at) / Math.log10(LEGEND_STEP)));
    if (r > S.legendRank) { S.legendRank = r; Hooks.legend(r); }
  }
}
function updateScoops() {
  if (!scoopsUnlocked()) return;
  const t = Date.now();
  if (!S.scoopTime) { S.scoopTime = t; S.scoops++; Hooks.scoop(true); return; }
  let n = 0;
  while (t - S.scoopTime >= scoopInterval() && n < 12) { S.scoopTime += scoopInterval(); S.scoops++; n++; }
  if (n >= 12) S.scoopTime = t;
  if (n) Hooks.scoop(false);
}
function checkAchievements() {
  for (const a of ACH) {
    if (!achSet.has(a.id) && a.test()) { S.ach.push(a.id); achSet.add(a.id); if (!a.shadow) regularAch++; Hooks.achievement(a); }
  }
}
function slowTick() {
  updateStage();
  updateScoops();
  if (new Date().getHours() < 5) S.flags.night = true;
  if (clock() - R.lastClick >= 900000 && baseGps() >= 1) S.flags.patience = true;
  extEach('slow');
  checkAchievements();
}
function tick(dt) {
  earn(gps() * dt);
  S.playTime += dt;
  S.runTime += dt;
  const t = clock();
  if (R.buffs.length) R.buffs = R.buffs.filter(b => b.until > t);
  if (!R.nextShaker) R.nextShaker = t + shakerDelay();
  if (t >= R.nextShaker) { R.nextShaker = t + shakerDelay(); Hooks.spawnShaker(shakerStay(), R.chain > 0); }
  if (perk('partner')) {
    R.autoAcc += dt * (perk('group') ? 5 : 2);
    while (R.autoAcc >= 1) { R.autoAcc--; Hooks.autoClick(click(true)); }
  }
  extEach('tick', dt);
  R.slowAcc += dt;
  if (R.slowAcc >= 1) { R.slowAcc = 0; slowTick(); }
}

// ---------- Save ----------
function serialize(at = Date.now()) { S.lastSave = at; return JSON.stringify(S); }
function loadFrom(json) {
  // Validate into a temporary object first so a bad import can't replace the current save.
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a save');
  const next = Object.assign(defaultState(), data);
  for (const k of ['upg', 'ach', 'lockers', 'splitsTried']) if (!Array.isArray(next[k])) throw new Error('bad ' + k);
  for (const k of ['owned', 'muscles', 'records', 'flags', 'perks', 'blevels', 'ext']) if (!next[k] || typeof next[k] !== 'object') throw new Error('bad ' + k);
  if (typeof next.gymName !== 'string') next.gymName = defaultState().gymName;
  if (!SPLIT_BY_ID[next.split]) next.split = 'full';
  if (!next.splitsTried.includes(next.split)) next.splitsTried.push(next.split);
  next.upg = next.upg.filter(id => UPG_BY_ID[id]);
  next.ach = next.ach.filter(id => ACH_BY_ID[id]);
  S = next;
  U = new Set(S.upg);
  achSet = new Set(S.ach);
  recountAch();
}
function resetAll() { S = defaultState(); U = new Set(); achSet = new Set(); regularAch = 0; R.buffs = []; R.chain = 0; }
function awayGain(sec) {
  const rested = perk('rest') > 0;
  const cap = perk('weekend') ? 259200 : rested ? 28800 : 7200;
  const away = Math.min(cap, sec);
  return { away, v: baseGps() * away * (rested ? 1 : 0.5) };
}
function offlineProgress() {
  const { away, v } = awayGain((Date.now() - S.lastSave) / 1000);
  if (away < 30 || v <= 0) return null;
  S.runTime += away; S.playTime += away;
  earn(v);
  return { away, v };
}
