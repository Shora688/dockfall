// Généré par tools/convertir_fonctions.js à partir de site/netlify/functions/avis.mjs : ne pas modifier ici.
// Avis des joueurs, envoyés depuis le jeu (bouton « Donner mon avis »).
// POST /api/avis -> enregistre le message. Il n'y a volontairement aucune lecture publique :
// les avis se lisent dans le tableau de bord Netlify (Projet > Blobs > magasin « avis »).
import { magasin, sha256 } from "../../cf/magasin.js";

const ENTETES = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};
const repondre = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: ENTETES });
const mot = (v, longueur = 20) => String(v || "").replace(/[^a-z0-9_.\-]/gi, "").slice(0, longueur);

export async function onRequest({ request: req, env }) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ENTETES });
  if (req.method !== "POST") return repondre({ erreur: "Méthode non prise en charge." }, 405);
  let d;
  try { d = await req.json(); } catch { return repondre({ erreur: "Données illisibles." }, 400); }
  const texte = String(d.texte || "").replace(/\s+$/g, "").slice(0, 2000);
  if (texte.trim().length < 3) return repondre({ erreur: "Message trop court." }, 400);
  if (!/^[0-9a-f]{32}$/.test(String(d.id || ""))) return repondre({ erreur: "Identifiant invalide." }, 400);
  const avis = {
    texte,
    id: String(d.id).slice(0, 8),
    version: mot(d.version, 12),
    langue: mot(d.langue, 4),
    contexte: String(d.contexte || "").slice(0, 300),
    date: new Date().toISOString(),
  };
  if (new URL(req.url).searchParams.get("essai") === "1") return repondre({ essai: true, avis });
  const store = magasin(env, "avis");
  await store.setJSON(avis.date + "-" + Math.random().toString(36).slice(2, 8), avis);
  return repondre({ ok: true });
}
