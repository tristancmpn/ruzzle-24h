// Ecrans Classement et Profil.
import * as online from "./online.js";
import { dateKey } from "./game.js";

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ERRORS = {
  unknown_player: "Code de récupération inconnu.",
  not_friends: "Vous n'êtes pas amis.",
};
const errText = (e) => ERRORS[e.message] || "Pas de connexion. Réessaie dans un instant.";

function setMsg(id, text, kind = "") {
  const el = $(id);
  el.textContent = text;
  el.className = "msg" + (kind ? " " + kind : "");
}

let ctx = null; // { show, toast, onProfile }
let currentPlayer = null;

export function initSocial(options) {
  ctx = options;

  $("btn-social").addEventListener("click", openSocial);
  $("btn-back3").addEventListener("click", () => { ctx.show("home"); refreshBadge(); });
  $("btn-back4").addEventListener("click", openSocial);
  $("s-me").addEventListener("click", () => openPlayer(online.getProfile().id));
  $("s-create").addEventListener("click", createProfile);
  $("s-restore").addEventListener("click", restoreProfile);
  $("s-add").addEventListener("click", addFriend);
  $("p-secret").addEventListener("click", revealSecret);
  $("p-rename").addEventListener("click", rename);
  $("p-remove").addEventListener("click", removeFriend);

  refreshBadge();
}

// ---------- Badge des demandes sur l'accueil ----------
export async function refreshBadge() {
  const badge = $("home-badge");
  if (!online.configured() || !online.getProfile()) return (badge.hidden = true);
  try {
    const data = await online.getSocial(dateKey());
    badge.textContent = data.incoming.length;
    badge.hidden = data.incoming.length === 0;
  } catch {
    badge.hidden = true;
  }
}

// ---------- Classement ----------
async function openSocial() {
  ctx.show("social");
  const configured = online.configured();
  const profile = online.getProfile();
  $("s-off").hidden = configured;
  $("s-setup").hidden = !configured || Boolean(profile);
  $("s-main").hidden = !configured || !profile;
  if (configured && profile) await renderSocial();
}

async function renderSocial() {
  const profile = online.getProfile();
  $("s-mycode").textContent = profile.friend_code;
  $("s-board").innerHTML = `<p class="hint">Chargement…</p>`;
  let data;
  try {
    data = await online.getSocial(dateKey());
  } catch (e) {
    $("s-board").innerHTML = `<p class="hint">${esc(errText(e))}</p>`;
    return;
  }

  $("s-board").innerHTML = data.board
    .map((p, i) => `
      <button class="lb-row${p.id === profile.id ? " me" : ""}" data-id="${p.id}">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${esc(p.name)}</span>
        <span class="lb-words">${p.words}${p.total ? " / " + p.total : ""} mots</span>
        <span class="lb-score">${p.score}</span>
      </button>`)
    .join("") +
    (data.board.length === 1 ? `<p class="hint">Ajoute des amis pour les voir ici.</p>` : "");
  $("s-board").querySelectorAll(".lb-row").forEach((row) =>
    row.addEventListener("click", () => openPlayer(row.dataset.id)));

  $("s-requests").hidden = data.incoming.length === 0;
  $("s-incoming").innerHTML = data.incoming
    .map((p) => `
      <div class="req">
        <span class="req-name">${esc(p.name)}</span>
        <button class="btn btn-primary" data-id="${p.id}" data-accept="1">Accepter</button>
        <button class="btn" data-id="${p.id}">Refuser</button>
      </div>`)
    .join("");
  $("s-incoming").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await online.respondFriend(b.dataset.id, Boolean(b.dataset.accept));
      } catch (e) {
        ctx.toast(errText(e));
      }
      renderSocial();
      refreshBadge();
    }));

  $("s-outgoing").textContent = data.outgoing.length
    ? "En attente de réponse : " + data.outgoing.map((p) => p.name).join(", ")
    : "";
}

async function createProfile() {
  const name = $("s-name").value.trim();
  if (!name) return setMsg("s-create-msg", "Choisis un pseudo.", "err");
  setMsg("s-create-msg", "Création…");
  try {
    await online.createPlayer(name);
    setMsg("s-create-msg", "");
    ctx.onProfile();
    openSocial();
  } catch (e) {
    setMsg("s-create-msg", errText(e), "err");
  }
}

async function restoreProfile() {
  const code = $("s-secret").value.replace(/[^0-9a-z]/gi, "");
  if (!code) return setMsg("s-restore-msg", "Saisis ton code.", "err");
  setMsg("s-restore-msg", "Vérification…");
  try {
    await online.restorePlayer(code);
    setMsg("s-restore-msg", "");
    ctx.onProfile();
    openSocial();
  } catch (e) {
    setMsg("s-restore-msg", errText(e), "err");
  }
}

const ADD_RESULTS = {
  sent: ["Demande envoyée.", "ok"],
  accepted: ["Vous êtes maintenant amis.", "ok"],
  already: ["Vous êtes déjà amis.", ""],
  pending: ["Demande déjà envoyée, en attente.", ""],
  self: ["C'est ton propre code.", "err"],
  not_found: ["Aucun joueur avec ce code.", "err"],
};

async function addFriend() {
  const code = $("s-code").value.trim();
  if (!code) return setMsg("s-add-msg", "Saisis un code ami.", "err");
  try {
    const res = await online.requestFriend(code);
    setMsg("s-add-msg", ...ADD_RESULTS[res]);
    if (res === "sent" || res === "accepted") $("s-code").value = "";
    renderSocial();
  } catch (e) {
    setMsg("s-add-msg", errText(e), "err");
  }
}

// ---------- Profil ----------
function kpis(items) {
  return items
    .map(([value, label]) => `<div class="kpi"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`)
    .join("");
}

function lastDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

async function openPlayer(id) {
  ctx.show("player");
  currentPlayer = null;
  $("p-name").textContent = "…";
  ["p-today", "p-week-kpis", "p-week", "p-all"].forEach((k) => ($(k).innerHTML = ""));
  $("p-mine").hidden = true;
  $("p-remove").hidden = true;

  let p;
  try {
    p = await online.getPlayer(id, dateKey());
  } catch (e) {
    $("p-today").innerHTML = `<p class="hint">${esc(errText(e))}</p>`;
    return;
  }
  currentPlayer = p;
  $("p-name").textContent = p.name;

  const t = p.today || { score: 0, words: 0, total: 0 };
  $("p-today").innerHTML = kpis([
    [t.score, "points"],
    [`${t.words}${t.total ? " / " + t.total : ""}`, "mots"],
  ]);

  const byDay = new Map(p.week.map((d) => [d.day, d]));
  const days = lastDays(7).map((d) => ({ date: d, ...(byDay.get(dateKey(d)) || { score: 0, words: 0 }) }));
  const max = Math.max(1, ...days.map((d) => d.score));
  $("p-week-kpis").innerHTML = kpis([
    [days.reduce((a, d) => a + d.score, 0), "points"],
    [days.reduce((a, d) => a + d.words, 0), "mots"],
  ]);
  $("p-week").innerHTML = days
    .map((d) => `
      <div class="wk">
        <span class="wk-day">${d.date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span>
        <span class="wk-bar"><div style="width:${(100 * d.score) / max}%"></div></span>
        <span class="wk-val">${d.score} pts · ${d.words} mots</span>
      </div>`)
    .join("");

  const a = p.all_time;
  $("p-all").innerHTML = kpis([
    [a.score, "points"],
    [a.words, "mots"],
    [a.days, "jours joués"],
    [a.best, "meilleur jour"],
    [a.complete, "grilles finies"],
  ]);

  if (p.is_me) {
    $("p-mine").hidden = false;
    $("p-code").textContent = online.getProfile().friend_code;
    $("p-secret").textContent = "Afficher";
  } else {
    $("p-remove").hidden = false;
  }
}

function revealSecret() {
  const s = online.getProfile().secret;
  $("p-secret").textContent = s.match(/.{1,4}/g).join("-");
}

async function rename() {
  const name = (prompt("Nouveau pseudo", online.getProfile().name) || "").trim().slice(0, 20);
  if (!name) return;
  try {
    await online.renamePlayer(name);
    $("p-name").textContent = name;
  } catch (e) {
    ctx.toast(errText(e));
  }
}

async function removeFriend() {
  if (!currentPlayer || !confirm(`Retirer ${currentPlayer.name} de tes amis ?`)) return;
  try {
    await online.removeFriend(currentPlayer.id);
    openSocial();
  } catch (e) {
    ctx.toast(errText(e));
  }
}
