// Téléchargement du jeu : compte, puis renvoie vers le fichier hébergé par GitHub (gratuit, sans limite de bande passante).
// GET  /api/telecharger            -> +1 téléchargement depuis le site, redirection vers le .zip
// GET  /api/telecharger?source=maj -> +1 mise à jour automatique depuis le jeu, redirection vers le .zip
// HEAD /api/telecharger            -> la taille du fichier (le site l'affiche), sans compter
// GET  /api/telecharger?compte=1   -> { site, maj, total, par_jour: { "AAAA-MM-JJ": { site, maj } } }
import { getStore } from "@netlify/blobs";

const FICHIER = "https://raw.githubusercontent.com/Shora688/dockfall/main/telechargement/Dockfall-windows.zip";
const ENTETES = { "access-control-allow-origin": "*", "cache-control": "no-store" };

export default async (req) => {
  const params = new URL(req.url).searchParams;
  if (req.method === "HEAD") {
    const r = await fetch(FICHIER, { method: "HEAD" });
    return new Response(null, { status: r.ok ? 200 : 404, headers: { ...ENTETES, "content-length": r.headers.get("content-length") || "0", "content-type": "application/zip" } });
  }
  const store = getStore({ name: "telechargements", consistency: "strong" });
  const compte = (await store.get("compte", { type: "json" })) || { site: 0, maj: 0, par_jour: {} };
  if (params.has("compte")) {
    return new Response(JSON.stringify({ ...compte, total: compte.site + compte.maj }), { headers: { ...ENTETES, "content-type": "application/json; charset=utf-8" } });
  }
  const source = params.get("source") === "maj" ? "maj" : "site";
  const jour = new Date().toISOString().slice(0, 10);
  compte[source] += 1;
  compte.par_jour[jour] = compte.par_jour[jour] || { site: 0, maj: 0 };
  compte.par_jour[jour][source] += 1;
  await store.setJSON("compte", compte);
  return new Response(null, { status: 302, headers: { ...ENTETES, location: FICHIER } });
};

export const config = { path: "/api/telecharger" };
