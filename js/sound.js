// Sons synthetises (Web Audio), aucun fichier a charger.

let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem("r24:sound") !== "off"; } catch {}

// iOS n'autorise le son qu'apres un geste de l'utilisateur
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function isEnabled() {
  return enabled;
}

export function setEnabled(on) {
  enabled = on;
  try { localStorage.setItem("r24:sound", on ? "on" : "off"); } catch {}
}

function tone(freq, start, dur, { type = "sine", vol = 0.25, slideTo = null } = {}) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function play(fn) {
  if (!enabled || !ctx) return;
  fn();
}

// Cloche : fondamentale + partiels inharmoniques, attaque seche, decroissance rapide
function bell(freq, start, dur, vol = 0.22) {
  tone(freq, start, dur, { type: "sine", vol });
  tone(freq * 2.76, start, dur * 0.5, { type: "sine", vol: vol * 0.35 });
  tone(freq * 5.4, start, dur * 0.25, { type: "sine", vol: vol * 0.12 });
}

// Gamme majeure : chaque lettre ajoutee monte d'un cran
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26];

// "Pop" a chaque lettre
export function letter(n) {
  play(() => {
    const f = 440 * Math.pow(2, SCALE[Math.min(n - 1, SCALE.length - 1)] / 12);
    tone(f * 1.6, 0, 0.07, { type: "sine", vol: 0.25, slideTo: f });
  });
}

// Mot trouve : "pling" cristallin en deux notes
export function good() {
  play(() => {
    bell(1318.5, 0, 0.35);
    bell(1975.5, 0.07, 0.5);
  });
}

// Deja trouve : "tock" neutre
export function duplicate() {
  play(() => tone(700, 0, 0.12, { type: "triangle", vol: 0.22, slideTo: 620 }));
}

// Mot invalide : "bonk" sourd et grave
export function bad() {
  play(() => {
    tone(190, 0, 0.22, { type: "sine", vol: 0.45, slideTo: 85 });
    tone(120, 0, 0.18, { type: "triangle", vol: 0.2, slideTo: 60 });
  });
}

// Mot en or : envolee scintillante puis accord
export function gold() {
  play(() => {
    [1046.5, 1318.5, 1568, 2093, 2637, 3136].forEach((f, i) => bell(f, i * 0.05, 0.25, 0.16));
    [1046.5, 1318.5, 1568].forEach((f) => bell(f, 0.38, 1.1, 0.14));
    tone(2093, 0.38, 1.1, { type: "triangle", vol: 0.08 });
  });
}

// Grille terminee : arpege de cloches
export function win() {
  play(() => {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, i * 0.11, i === 3 ? 0.9 : 0.3));
  });
}
