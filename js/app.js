import {
  VALUES, dateKey, yesterdayKey, makeGrid, isAdjacent, scorePath,
  loadDictionary, isWord, isCommon, solutionOf, goldWords, foundCommon, loadProgress, saveProgress, totalScore,
} from "./game.js";
import * as sound from "./sound.js";
import * as online from "./online.js";
import { initSocial, refreshBadge } from "./social.js";

const $ = (id) => document.getElementById(id);

const CROWN = `<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z" fill="currentColor"/><rect x="5" y="19" width="14" height="2" rx="1" fill="currentColor"/></svg>`;

const state = {
  key: null,
  grid: null,
  solution: null, // Map mot -> points max
  gold: null, // Set des mots en or
  progress: null,
  path: [],
  dragging: false,
};

// ---------- Navigation ----------
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === view));
}

// ---------- Grille du jour ----------
async function setupDay() {
  await loadDictionary();
  state.key = dateKey();
  state.grid = makeGrid(state.key);
  state.solution = solutionOf(state.grid);
  state.gold = goldWords(state.solution);
  state.total = [...state.solution.keys()].filter(isCommon).length;
  state.progress = loadProgress(state.key);
  state.progress.total = state.total;
  renderBoard($("board"), state.grid);
  renderHome();
  renderStats();
}

function bonusCount(progress) {
  return Object.keys(progress.found).length - foundCommon(progress);
}

function renderHome() {
  const found = foundCommon(state.progress);
  const total = state.total;
  const bonus = bonusCount(state.progress);
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  $("home-date").textContent = date[0].toUpperCase() + date.slice(1);
  $("home-count").textContent = `${found} / ${total} mots` + (bonus ? ` · +${bonus} bonus` : "");
  $("home-score").textContent = `${totalScore(state.progress)} pts`;
  $("home-bar").style.width = total ? `${(100 * found) / total}%` : "0";
  $("btn-play").textContent = found === total ? "Grille terminée !" : found ? "Continuer" : "Jouer";
}

function renderStats() {
  const bonus = bonusCount(state.progress);
  $("g-count").textContent = `${foundCommon(state.progress)} / ${state.total}` + (bonus ? ` mots · +${bonus} bonus` : " mots");
  $("g-score").textContent = totalScore(state.progress);
}

function renderBoard(el, grid) {
  el.querySelectorAll(".cell").forEach((c) => c.remove());
  grid.letters.forEach((letter, i) => {
    const cell = document.createElement("div");
    cell.className = "cell" + (grid.bonus[i] ? " b-" + grid.bonus[i] : "");
    cell.dataset.i = i;
    cell.innerHTML =
      `<span class="val">${VALUES[letter]}</span>${letter.toUpperCase()}` +
      (grid.bonus[i] ? `<span class="bonus">${grid.bonus[i]}</span>` : "");
    el.appendChild(cell);
  });
}

// ---------- Minuteur (jusqu'a minuit) ----------
function tick() {
  if (state.key && dateKey() !== state.key) {
    // Nouvelle journee : nouvelle grille
    setupDay();
    show("home");
    return;
  }
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((midnight - now) / 1000));
  const p = (n) => String(n).padStart(2, "0");
  const txt = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  $("home-timer").textContent = txt;
  $("g-timer").textContent = txt;
}

// ---------- Trace du doigt ----------
const board = $("board");
let cellRects = [];
let boardRect = null;

function cellAt(x, y) {
  // Zone de detection reduite au centre de la case pour faciliter les diagonales
  for (let i = 0; i < cellRects.length; i++) {
    const r = cellRects[i];
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (Math.hypot(x - cx, y - cy) < r.width * 0.46) return i;
  }
  return -1;
}

function currentWord() {
  return state.path.map((i) => state.grid.letters[i]).join("");
}

function updateTrace() {
  const cells = board.querySelectorAll(".cell");
  cells.forEach((c, i) => c.classList.toggle("sel", state.path.includes(i)));

  const pts = state.path.map((i) => {
    const r = cellRects[i];
    return `${r.left - boardRect.left + r.width / 2},${r.top - boardRect.top + r.height / 2}`;
  });
  $("trail-line").setAttribute("points", pts.join(" "));

  const w = currentWord();
  const el = $("g-word");
  // Pas d'indice pendant le trace : le verdict tombe au relachement
  el.className = "word" + (w ? " show" : "");
  el.textContent = w.toUpperCase();
}

function startDrag(e) {
  if (!state.grid) return;
  sound.unlock();
  boardRect = board.getBoundingClientRect();
  cellRects = [...board.querySelectorAll(".cell")].map((c) => c.getBoundingClientRect());
  $("trail").setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
  clearFlash();
  const i = cellAt(e.clientX, e.clientY);
  if (i < 0) return;
  try { board.setPointerCapture(e.pointerId); } catch {}
  state.dragging = true;
  state.path = [i];
  sound.letter(1);
  updateTrace();
}

function moveDrag(e) {
  if (!state.dragging) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i < 0) return;
  const path = state.path;
  const last = path[path.length - 1];
  if (i === last) return;
  if (path.length > 1 && i === path[path.length - 2]) {
    path.pop(); // retour en arriere
  } else if (!path.includes(i) && isAdjacent(last, i)) {
    path.push(i);
    sound.letter(path.length);
  } else {
    return;
  }
  updateTrace();
}

let flashTimer = null;

function clearFlash() {
  clearTimeout(flashTimer);
  board.querySelectorAll(".cell").forEach((c) =>
    c.classList.remove("sel", "flash-ok", "flash-dup", "flash-bad", "flash-gold", "flash-bonus"));
  $("trail-line").setAttribute("points", "");
  $("g-word").className = "word";
}

function endDrag() {
  if (!state.dragging) return;
  state.dragging = false;
  const w = currentWord();
  const path = state.path;
  state.path = [];
  $("trail-line").setAttribute("points", "");

  if (w.length < 2) return clearFlash();

  let result;
  if (!isWord(w)) {
    result = "bad";
  } else if (state.progress.found[w] !== undefined) {
    result = "dup";
  } else {
    result = state.gold.has(w) ? "gold" : isCommon(w) ? "ok" : "bonus";
    state.progress.found[w] = scorePath(state.grid, path);
    saveProgress(state.key, state.progress);
    renderStats();
    scheduleSync();
  }

  const cells = board.querySelectorAll(".cell");
  path.forEach((i) => {
    cells[i].classList.remove("sel");
    cells[i].classList.add("flash-" + result);
  });
  const el = $("g-word");
  el.className = "word show " + result;
  const gained = result === "ok" || result === "gold" || result === "bonus";
  el.innerHTML = (result === "gold" ? CROWN : "") + (result === "bonus" ? `<span class="tag">BONUS</span>` : "") +
    w.toUpperCase() + (gained ? `<span class="pts">+${state.progress.found[w]}</span>` : "");

  flashTimer = setTimeout(clearFlash, result === "gold" ? 1600 : result === "bonus" ? 1000 : 700);

  const complete = (result === "ok" || result === "gold") && foundCommon(state.progress) === state.total;
  if (complete) {
    sound.win();
    toast("Bravo ! Tu as trouvé tous les mots !", 4000);
  } else if (result === "gold") {
    sound.gold();
    toast("Mot en or ! Le meilleur mot de la grille", 2500);
  } else {
    ({ ok: sound.good, bonus: sound.bonus, dup: sound.duplicate, bad: sound.bad })[result]();
  }
}

board.addEventListener("pointerdown", startDrag);
board.addEventListener("pointermove", moveDrag);
board.addEventListener("pointerup", endDrag);
board.addEventListener("pointercancel", endDrag);

// ---------- Listes de mots ----------
function renderWordList(el, words, foundSet, goldSet) {
  // words : [[mot, points]], regroupes par longueur decroissante
  if (!words.length) {
    el.innerHTML = `<p class="empty">Aucun mot pour l'instant.</p>`;
    return;
  }
  const groups = new Map();
  for (const [w, p] of words) {
    if (!groups.has(w.length)) groups.set(w.length, []);
    groups.get(w.length).push([w, p]);
  }
  el.innerHTML = [...groups.keys()]
    .sort((a, b) => b - a)
    .map((len) => {
      const chips = groups.get(len)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([w, p]) => {
          const cls = (foundSet && foundSet.has(w) ? " found" : "") +
            (goldSet.has(w) ? " gold" : isCommon(w) ? "" : " bonus");
          return `<span class="chip${cls}">${goldSet.has(w) ? CROWN : ""}${w.toUpperCase()}<small>${p}</small></span>`;
        })
        .join("");
      return `<div class="group-title">${len} lettres</div><div class="chips">${chips}</div>`;
    })
    .join("");
}

function openWords() {
  const found = Object.entries(state.progress.found);
  const bonus = bonusCount(state.progress);
  $("sheet-title").textContent = `Mes mots (${found.length - bonus}${bonus ? " + " + bonus + " bonus" : ""})`;
  renderWordList($("sheet-list"), found, null, state.gold);
  $("sheet").hidden = false;
}

function openYesterday() {
  const key = yesterdayKey();
  const grid = makeGrid(key);
  const solution = solutionOf(grid);
  const progress = loadProgress(key);
  const foundSet = new Set(Object.keys(progress.found));
  const total = [...solution.keys()].filter(isCommon).length;
  const bonus = bonusCount(progress);
  renderBoard($("y-board"), grid);
  $("y-summary").textContent =
    `Tu as trouvé ${foundCommon(progress)} / ${total} mots` + (bonus ? ` + ${bonus} bonus` : "") +
    ` · ${totalScore(progress)} pts`;
  renderWordList($("y-list"), [...solution.entries()], foundSet, goldWords(solution));
  show("yesterday");
}

// ---------- Envoi des scores au classement ----------
let syncTimer = null;

function syncDay(key, progress) {
  if (!Object.keys(progress.found).length) return Promise.resolve();
  const words = foundCommon(progress);
  return online.submitScore(key, totalScore(progress), words, progress.total || 0).catch(() => {});
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncDay(state.key, state.progress), 1500);
}

// Envoie aussi les jours deja joues sur cet appareil
async function syncAll() {
  if (!online.configured() || !online.getProfile()) return;
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^r24:\d{4}-\d{2}-\d{2}$/.test(k)) keys.push(k.slice(4));
    }
  } catch {}
  for (const key of keys) {
    await syncDay(key, key === state.key ? state.progress : loadProgress(key));
  }
}

// ---------- Divers ----------
let toastTimer = null;
function toast(msg, ms = 2000) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

$("btn-play").addEventListener("click", () => state.grid && show("game"));
$("btn-back").addEventListener("click", () => { renderHome(); show("home"); });
$("btn-back2").addEventListener("click", () => show("home"));
$("btn-words").addEventListener("click", openWords);
$("btn-yesterday").addEventListener("click", () => state.grid && openYesterday());
function renderSoundBtn() {
  $("btn-sound").classList.toggle("muted", !sound.isEnabled());
  $("btn-sound").setAttribute("aria-label", sound.isEnabled() ? "Couper le son" : "Activer le son");
}
$("btn-sound").addEventListener("click", () => {
  sound.unlock();
  sound.setEnabled(!sound.isEnabled());
  renderSoundBtn();
  sound.good();
});
renderSoundBtn();
$("btn-rules").addEventListener("click", () => ($("rules").hidden = false));
$("sheet-close").addEventListener("click", () => ($("sheet").hidden = true));
$("rules-close").addEventListener("click", () => ($("rules").hidden = true));
document.querySelectorAll(".sheet").forEach((s) =>
  s.addEventListener("click", (e) => { if (e.target === s) s.hidden = true; }));

// Revenir dans l'app apres minuit => nouvelle grille
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { tick(); refreshBadge(); if (swReg) swReg.update(); }
});

// Mise a jour automatique : quand une nouvelle version prend le relais, on recharge
// (la progression est deja sauvegardee sur l'appareil)
let swReg = null;
if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register("sw.js").then((r) => (swReg = r));
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) location.reload();
  });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

initSocial({ show, toast, onProfile: syncAll });

$("home-count").textContent = "Chargement…";
setupDay().then(() => { tick(); syncAll(); });
setInterval(tick, 1000);
