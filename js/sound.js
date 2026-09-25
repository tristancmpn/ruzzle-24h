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

// Petit "tic" a chaque lettre, de plus en plus aigu
export function letter(n) {
  play(() => tone(520 * Math.pow(2, Math.min(n - 1, 12) / 12), 0, 0.09, { type: "triangle", vol: 0.2 }));
}

export function good() {
  play(() => {
    tone(660, 0, 0.12, { type: "triangle" });
    tone(880, 0.08, 0.12, { type: "triangle" });
    tone(1320, 0.16, 0.22, { type: "triangle" });
  });
}

export function duplicate() {
  play(() => {
    tone(600, 0, 0.1, { type: "sine", vol: 0.2 });
    tone(600, 0.13, 0.1, { type: "sine", vol: 0.2 });
  });
}

export function bad() {
  play(() => tone(220, 0, 0.25, { type: "square", vol: 0.08, slideTo: 140 }));
}

export function win() {
  play(() => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      tone(f, i * 0.14, i === 5 ? 0.6 : 0.16, { type: "triangle", vol: 0.25 }));
  });
}
