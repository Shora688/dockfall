// Statistiques anonymes des parties de Dockfall, pour équilibrer le jeu.
// POST /api/stats   -> enregistre une partie terminée (aucune donnée personnelle : un identifiant aléatoire d'installation)
// GET  /api/stats   -> résumé public : nombre de parties, durée moyenne, causes de fin, échéance atteinte, par version
// Stockage : Netlify Blobs, magasin « statistiques », une entrée par mois (500 parties max par mois et par version gardées en détail).
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// Lecture privée des résumés de parties (GET /api/stats?resumes=AAAA-MM&cle=…) : seule l empreinte de la clé est ici.
const EMPREINTE_CLE = "31ffddb5772e188e5c1d9e6bf7fe6082dc62cd630ad81fbc6ee0b02a1a8631d3";
const RESUME_MAX = 40000;   // octets ; un résumé normal en fait 3 à 15

const ENTETES = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};
const repondre = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: ENTETES });
const CAUSES = ["echeances", "taxes", "equipage", "retraite", "vente", "abandon", "autre"];
const MAX_PAR_MOIS = 5000;

const entier = (v, min, max) => Math.min(Math.max(Math.floor(Number(v) || 0), min), max);
const mot = (v, longueur = 20) => String(v || "").replace(/[^a-z0-9_.\-]/gi, "").slice(0, longueur);

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ENTETES });
  const store = getStore({ name: "statistiques", consistency: "strong" });

  if (req.method === "GET") {
    const params = new URL(req.url).searchParams;
    if (params.has("resumes") || params.has("avis")) {
      const cle = params.get("cle") || "";
      if (createHash("sha256").update(cle).digest("hex") !== EMPREINTE_CLE) return repondre({ erreur: "Accès refusé." }, 403);
      if (params.has("avis")) {
        const magasin = getStore({ name: "avis", consistency: "strong" });
        const { blobs: liste } = await magasin.list();
        const avis = [];
        for (const b of liste) avis.push(await magasin.get(b.key, { type: "json" }));
        return repondre({ avis });
      }
      const resumes = getStore({ name: "resumes", consistency: "strong" });
      const { blobs: liste } = await resumes.list({ prefix: (params.get("resumes") || "") });
      const apres = params.get("apres") || "";
      const cles = liste.map((b) => b.key).sort().filter((k) => k > apres).slice(0, 300);
      const parties = [];
      for (const k of cles) parties.push({ cle: k, ...(await resumes.get(k, { type: "json" })) });
      return repondre({ total: liste.length, parties, suite: cles.length === 300 ? cles[cles.length - 1] : "" });
    }
    const { blobs } = await store.list();
    const parties = [];
    for (const b of blobs) parties.push(...((await store.get(b.key, { type: "json" })) || []));
    const parVersion = {};
    const causes = {};
    const echeances = {};
    let cycles = 0;
    for (const p of parties) {
      parVersion[p.version] = (parVersion[p.version] || 0) + 1;
      causes[p.cause] = (causes[p.cause] || 0) + 1;
      echeances[p.echeance] = (echeances[p.echeance] || 0) + 1;
      cycles += p.cycles;
    }
    const tries = parties.map((p) => p.cycles).sort((a, b) => a - b);
    return repondre({
      parties: parties.length,
      cycles_moyens: parties.length ? Math.round((cycles / parties.length) * 10) / 10 : 0,
      cycles_medians: tries.length ? tries[Math.floor(tries.length / 2)] : 0,
      causes, echeance_atteinte: echeances, par_version: parVersion,
    });
  }
  if (req.method !== "POST") return repondre({ erreur: "Méthode non prise en charge." }, 405);

  let d;
  try { d = await req.json(); } catch { return repondre({ erreur: "Données illisibles." }, 400); }
  if (!/^[0-9a-f]{32}$/.test(String(d.id || ""))) return repondre({ erreur: "Identifiant invalide." }, 400);
  const partie = {
    id: String(d.id).slice(0, 8),                 // un bout d'identifiant suffit à compter les joueurs distincts
    version: mot(d.version, 12),
    langue: mot(d.langue, 4),
    cycles: entier(d.cycles, 0, 5000),
    score: entier(d.score, 0, 10_000_000),
    echeance: entier(d.echeance, 0, 99),
    cause: CAUSES.includes(d.cause) ? d.cause : "autre",
    secteur: mot(d.secteur, 8),
    station: mot(d.station, 16),
    defi: mot(d.defi, 20),
    menace: entier(d.menace, 0, 5),
    proprietaire: Boolean(d.proprietaire),
    date: Date.now(),
  };
  if (new URL(req.url).searchParams.get("essai") === "1") return repondre({ essai: true, partie, resume: d.resume ? JSON.stringify(d.resume).length : 0 });
  const cle = "parties-" + new Date().toISOString().slice(0, 7);
  const liste = (await store.get(cle, { type: "json" })) || [];
  liste.push(partie);
  await store.setJSON(cle, liste.slice(-MAX_PAR_MOIS));
  // le résumé détaillé de la partie, à part (une entrée par partie) pour ne pas alourdir les chiffres publics
  if (d.resume && typeof d.resume === "object") {
    const texte = JSON.stringify(d.resume);
    if (texte.length <= RESUME_MAX) {
      const resumes = getStore({ name: "resumes", consistency: "strong" });
      await resumes.setJSON(new Date().toISOString().slice(0, 7) + "/" + partie.date + "-" + partie.id, { ...partie, resume: d.resume });
    }
  }
  return repondre({ ok: true });
};

export const config = { path: "/api/stats" };
