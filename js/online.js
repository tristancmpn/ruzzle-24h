// Classement en ligne (Supabase). Tout passe par des fonctions SQL (voir supabase/schema.sql).

// Cle publique "anon" : faite pour etre dans le code client, elle ne donne acces qu'aux fonctions.
export const SUPABASE_URL = "";
export const SUPABASE_KEY = "";

export const configured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    let msg = "network";
    try { msg = (await res.json()).message || msg; } catch {}
    throw new Error(msg);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------- Profil local ----------
const KEY = "r24:profile";

export function getProfile() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

function setProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export async function createPlayer(name) {
  const p = await rpc("create_player", { p_name: name });
  setProfile(p);
  return p;
}

export async function restorePlayer(secret) {
  const p = await rpc("restore_player", { p_secret: secret });
  setProfile(p);
  return p;
}

export async function renamePlayer(name) {
  const p = getProfile();
  await rpc("rename_player", { p_secret: p.secret, p_name: name });
  setProfile({ ...p, name });
}

// ---------- Scores ----------
export function submitScore(day, score, words, total) {
  const p = getProfile();
  if (!configured() || !p) return Promise.resolve();
  return rpc("submit_score", { p_secret: p.secret, p_day: day, p_score: score, p_words: words, p_total: total });
}

// ---------- Amis et classement ----------
const secret = () => getProfile().secret;

export const requestFriend = (code) => rpc("request_friend", { p_secret: secret(), p_code: code });
export const respondFriend = (id, accept) => rpc("respond_friend", { p_secret: secret(), p_player: id, p_accept: accept });
export const removeFriend = (id) => rpc("remove_friend", { p_secret: secret(), p_player: id });
export const getSocial = (day) => rpc("get_social", { p_secret: secret(), p_day: day });
export const getPlayer = (id, day) => rpc("get_profile", { p_secret: secret(), p_player: id, p_day: day });
