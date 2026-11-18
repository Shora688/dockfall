// Petit adaptateur : les fonctions du site (classement, statistiques, avis, compteur) ont été écrites pour
// Netlify Blobs ; ici elles tournent sur Cloudflare Workers KV (gratuit), avec la même façon de lire et d'écrire.
// Le stockage KV s'appelle DONNEES (liaison à créer dans le projet Cloudflare Pages) ; chaque « magasin » est un préfixe.
export function magasin(env, nom) {
  const kv = env.DONNEES;
  if (!kv) throw new Error("Stockage DONNEES non relié au projet.");
  const p = nom + "/";
  return {
    async get(cle, options = {}) {
      return kv.get(p + cle, options.type === "json" ? { type: "json" } : undefined);
    },
    async setJSON(cle, valeur) {
      await kv.put(p + cle, JSON.stringify(valeur));
    },
    async list(options = {}) {
      const blobs = [];
      let curseur;
      do {
        const r = await kv.list({ prefix: p + (options.prefix || ""), cursor: curseur });
        for (const k of r.keys) blobs.push({ key: k.name.slice(p.length) });
        curseur = r.list_complete ? undefined : r.cursor;
      } while (curseur);
      return { blobs };
    },
  };
}

// empreinte SHA-256 en hexadécimal (Web Crypto, disponible partout sur Cloudflare)
export async function sha256(texte) {
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, "0")).join("");
}
