// Classement en ligne de Dockfall : la partie la plus longue (en cycles), puis le meilleur score.
// GET  /api/scores            -> { total, top: [...] }   (les 50 premiers)
// GET  /api/scores?id=xxx     -> idem, plus { joueur: { rang, ... } } pour ce joueur
// POST /api/scores            -> enregistre une partie terminée ; garde la meilleure de chaque joueur
// Les données vivent dans Netlify Blobs (magasin « classement », une seule entrée JSON).
import { getStore } from "@netlify/blobs";

const CLE = "parties";
const TOP = 50;
const SECTEURS = ["tarn", "nox", "pell"];
const ENTETES = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

const repondre = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: ENTETES });

// la partie la plus longue d'abord, puis le meilleur score, puis la plus ancienne
const ordre = (a, b) => b.cycles - a.cycles || b.score - a.score || a.date - b.date;

function nettoyerPseudo(p) {
  return String(p || "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} _\-.']/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}

function classement(parties, id) {
  const tries = Object.values(parties).sort(ordre);
  const top = tries.slice(0, TOP).map((p, i) => ({ rang: i + 1, pseudo: p.pseudo, cycles: p.cycles, score: p.score, secteur: p.secteur, menace: p.menace, proprietaire: p.proprietaire, date: p.date }));
  const corps = { total: tries.length, top };
  if (id && parties[id]) {
    const rang = tries.findIndex((p) => p.id === id) + 1;
    const p = parties[id];
    corps.joueur = { rang, pseudo: p.pseudo, cycles: p.cycles, score: p.score };
  }
  return corps;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ENTETES });
  const store = getStore({ name: "classement", consistency: "strong" });
  const parties = (await store.get(CLE, { type: "json" })) || {};

  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id") || "";
    return repondre(classement(parties, id));
  }
  if (req.method !== "POST") return repondre({ erreur: "Méthode non prise en charge." }, 405);

  let d;
  try {
    d = await req.json();
  } catch {
    return repondre({ erreur: "Données illisibles." }, 400);
  }
  const id = String(d.id || "");
  const pseudo = nettoyerPseudo(d.pseudo);
  const cycles = Math.floor(Number(d.cycles));
  const score = Math.floor(Number(d.score));
  const menace = Math.floor(Number(d.menace) || 0);
  if (!/^[0-9a-f]{32}$/.test(id)) return repondre({ erreur: "Identifiant invalide." }, 400);
  if (pseudo.length < 2) return repondre({ erreur: "Pseudo trop court (2 caractères minimum)." }, 400);
  if (!(cycles >= 0 && cycles <= 5000) || !(score >= 0 && score <= 10_000_000)) return repondre({ erreur: "Partie invalide." }, 400);
  // garde-fou grossier : le score ne peut pas dépasser ce qu'une partie de cette durée permet
  if (score > (cycles + 1) * 2000) return repondre({ erreur: "Score incohérent." }, 400);

  const partie = {
    id, pseudo, cycles, score,
    secteur: SECTEURS.includes(d.secteur) ? d.secteur : "tarn",
    menace: Math.min(Math.max(menace, 0), 5),
    proprietaire: Boolean(d.proprietaire),
    version: String(d.version || "").slice(0, 12),
    date: Date.now(),
  };
  // ?essai=1 : tout est vérifié mais rien n'est enregistré (tests)
  if (new URL(req.url).searchParams.get("essai") === "1") return repondre({ essai: true, valide: true, partie: { pseudo, cycles, score } });
  const ancienne = parties[id];
  let record = false;
  if (!ancienne || ordre(partie, ancienne) < 0) {
    parties[id] = partie;
    record = true;
  } else {
    ancienne.pseudo = pseudo;   // le pseudo suit le dernier choisi
  }
  await store.setJSON(CLE, parties);
  return repondre({ ...classement(parties, id), record });
};

export const config = { path: "/api/scores" };
