// Logique du jeu : grille du jour, score, dictionnaire, solveur.

export const SIZE = 4;

// Valeurs des lettres (Scrabble francais, comme Ruzzle FR)
export const VALUES = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 10, l: 1, m: 2,
  n: 1, o: 1, p: 3, q: 8, r: 1, s: 1, t: 1, u: 1, v: 4, w: 10, x: 10, y: 10, z: 10,
};

// Sac de lettres pondere par la frequence en francais
const BAG =
  "e".repeat(15) + "a".repeat(9) + "i".repeat(8) + "n".repeat(6) + "o".repeat(6) +
  "r".repeat(6) + "s".repeat(6) + "t".repeat(6) + "u".repeat(6) + "l".repeat(5) +
  "dddmmmccppbbffgghhvvjqkwxyz";
const VOWELS = "aeiouy";
const RARE = "jkqwxyz";

// Bonus : LD/LT = lettre double/triple, MD/MT = mot double/triple
const BONUSES = ["LD", "LD", "LT", "LT", "MD", "MT"];

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nouvelles grilles "choisies" a partir de cette date (avant : tirage simple, inchange)
const V2_START = "2026-09-26";
const CANDIDATES = 40;
const TARGET_MIN = 100, TARGET_MAX = 200; // mots courants a trouver

function randomGrid(rnd, key) {
  const pick = () => BAG[Math.floor(rnd() * BAG.length)];
  let letters;
  for (;;) {
    letters = Array.from({ length: SIZE * SIZE }, pick);
    const vowels = letters.filter((c) => VOWELS.includes(c)).length;
    const rare = letters.filter((c) => RARE.includes(c)).length;
    const maxSame = Math.max(...letters.map((c) => letters.filter((x) => x === c).length));
    const qOk = !letters.includes("q") || letters.includes("u");
    if (vowels >= 5 && vowels <= 7 && rare <= 1 && maxSame <= 3 && qOk) break;
  }
  const bonus = Array(SIZE * SIZE).fill(null);
  const cells = [...Array(SIZE * SIZE).keys()];
  for (const b of BONUSES) {
    const i = cells.splice(Math.floor(rnd() * cells.length), 1)[0];
    bonus[i] = b;
  }
  return { key, letters, bonus };
}

// Meme date => meme grille, sans serveur. Necessite le dictionnaire charge.
export function makeGrid(key) {
  const rnd = mulberry32(hash("ruzzle24h-" + key));
  if (key < V2_START) return randomGrid(rnd, key);

  // On tire plusieurs grilles et on garde la plus riche dans la fourchette visee
  let best = null, bestScore = -Infinity;
  for (let k = 0; k < CANDIDATES; k++) {
    const grid = randomGrid(rnd, key);
    grid.solution = solve(grid);
    const common = [...grid.solution.keys()].filter(isCommon);
    const inRange = common.length >= TARGET_MIN && common.length <= TARGET_MAX;
    const longWords = common.filter((w) => w.length >= 6).length;
    const score = inRange ? 1000 + longWords : -Math.abs(common.length - (TARGET_MIN + TARGET_MAX) / 2);
    if (score > bestScore) { best = grid; bestScore = score; }
  }
  return best;
}

// Solution de la grille (calculee une seule fois)
export function solutionOf(grid) {
  return grid.solution || (grid.solution = solve(grid));
}

export function neighbors(i) {
  const r = Math.floor(i / SIZE), c = i % SIZE, out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(rr * SIZE + cc);
    }
  return out;
}

export function isAdjacent(a, b) {
  return neighbors(a).includes(b);
}

// Score Ruzzle : lettres (x LD/LT), puis x MD/MT, + bonus de longueur 5 pts/lettre au-dela de 4
export function scorePath(grid, path) {
  let sum = 0, mult = 1;
  for (const i of path) {
    let v = VALUES[grid.letters[i]];
    const b = grid.bonus[i];
    if (b === "LD") v *= 2;
    if (b === "LT") v *= 3;
    if (b === "MD") mult *= 2;
    if (b === "MT") mult *= 3;
    sum += v;
  }
  return sum * mult + Math.max(0, path.length - 4) * 5;
}

// Dictionnaire : tableau trie, recherche de prefixe par dichotomie
let dict = null;

export async function loadDictionary() {
  if (dict) return dict;
  const txt = await (await fetch("words.txt")).text();
  // Une ligne par mot, trie ; suffixe "*" = mot courant (les autres sont des mots bonus)
  const words = [], common = new Set();
  for (const line of txt.split("\n")) {
    if (line.endsWith("*")) {
      const w = line.slice(0, -1);
      words.push(w);
      common.add(w);
    } else if (line) {
      words.push(line);
    }
  }
  dict = { words, set: new Set(words), common };
  return dict;
}

function hasPrefix(words, p) {
  let lo = 0, hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid] < p) lo = mid + 1;
    else hi = mid;
  }
  return lo < words.length && words[lo].startsWith(p);
}

export function isWord(w) {
  return w.length >= 2 && dict.set.has(w);
}

export function isCommon(w) {
  return dict.common.has(w);
}

// Tous les mots de la grille, avec le meilleur score possible pour chacun
export function solve(grid) {
  const found = new Map();
  const used = new Array(SIZE * SIZE).fill(false);
  const path = [];
  const dfs = (i, s) => {
    s += grid.letters[i];
    if (!hasPrefix(dict.words, s)) return;
    used[i] = true;
    path.push(i);
    if (s.length >= 2 && dict.set.has(s)) {
      const pts = scorePath(grid, path);
      if (!found.has(s) || found.get(s) < pts) found.set(s, pts);
    }
    for (const j of neighbors(i)) if (!used[j]) dfs(j, s);
    used[i] = false;
    path.pop();
  };
  for (let i = 0; i < SIZE * SIZE; i++) dfs(i, "");
  return found;
}

// Mot(s) en or : les mots courants qui rapportent le plus de points dans la grille
export function goldWords(solution) {
  const common = [...solution].filter(([w]) => isCommon(w));
  const best = Math.max(0, ...common.map(([, p]) => p));
  return new Set(common.filter(([, p]) => p === best).map(([w]) => w));
}

// Nombre de mots courants trouves (les mots bonus ne comptent pas dans "x / y mots")
export function foundCommon(progress) {
  return Object.keys(progress.found).filter(isCommon).length;
}

// Progression sauvegardee sur l'appareil
export function loadProgress(key) {
  try {
    return JSON.parse(localStorage.getItem("r24:" + key)) || { found: {} };
  } catch {
    return { found: {} };
  }
}

export function saveProgress(key, progress) {
  try {
    localStorage.setItem("r24:" + key, JSON.stringify(progress));
  } catch {}
}

export function totalScore(progress) {
  return Object.values(progress.found).reduce((a, b) => a + b, 0);
}
