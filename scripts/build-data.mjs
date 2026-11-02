// Construit les fichiers de données de l'app à partir de tcgcsv.com (miroir quotidien des données TCGplayer).
// Sorties : public/data/cards.json, public/data/prices.json, public/data/history/<date>.json (hebdo)
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";

const OUT = new URL("../public/data/", import.meta.url);
const GAMES = { fw: 80, masters: 27 }; // Fusion World, Masters (Dragon Ball Super CCG)
const BASE = "https://tcgcsv.com/tcgplayer";

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "carte-collection/1.0" } });
      if (r.ok) return (await r.json()).results ?? [];
      if (r.status === 404) return [];
    } catch {}
    await new Promise((s) => setTimeout(s, 1000 * 2 ** i));
  }
  throw new Error("Échec : " + url);
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const ext = (p, k) => p.extendedData?.find((e) => e.name === k)?.value ?? "";
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

const cards = [];
const prices = {};
const sets = [];

for (const [game, cat] of Object.entries(GAMES)) {
  const groups = await get(`${BASE}/${cat}/groups`);
  await pool(groups, 6, async (g) => {
    const [products, pr] = await Promise.all([
      get(`${BASE}/${cat}/${g.groupId}/products`),
      get(`${BASE}/${cat}/${g.groupId}/prices`),
    ]);
    sets.push({ id: g.groupId, game, name: g.name, code: g.abbreviation ?? "", date: g.publishedOn?.slice(0, 10) ?? "" });
    for (const p of products) {
      const num = ext(p, "Number");
      if (!num) continue; // produits scellés (boosters, displays…) ignorés
      cards.push({
        id: p.productId, g: game, s: g.groupId, n: num,
        name: p.name, r: ext(p, "Rarity"), c: ext(p, "Color"), t: ext(p, "CardType"),
      });
    }
    for (const x of pr) {
      const v = [r2(x.marketPrice), r2(x.lowPrice), r2(x.midPrice)];
      const cur = prices[x.productId];
      // Si plusieurs variantes (Normal/Holofoil), on garde celle qui a un prix de marché
      if (!cur || (cur[0] == null && v[0] != null)) prices[x.productId] = v;
    }
  });
}

let usdEur = 0.9;
try {
  const fx = await (await fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=EUR")).json();
  usdEur = fx.rates.EUR;
} catch {}

const updated = new Date().toISOString().slice(0, 10);
await mkdir(new URL("history/", OUT), { recursive: true });
cards.sort((a, b) => a.n.localeCompare(b.n) || a.id - b.id);
await writeFile(new URL("cards.json", OUT), JSON.stringify({ updated, sets, cards }));
await writeFile(new URL("prices.json", OUT), JSON.stringify({ updated, usdEur, p: prices }));

// Historique hebdomadaire (prix de marché en USD) — le lundi, ou si aucun point depuis 7 jours
const hdir = new URL("history/", OUT);
const dates = (await readdir(hdir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
const last = dates.at(-1);
const ageDays = last ? (Date.parse(updated) - Date.parse(last)) / 864e5 : Infinity;
if (ageDays >= 7 || (new Date().getUTCDay() === 1 && last !== updated)) {
  const snap = {};
  for (const [id, v] of Object.entries(prices)) if (v[0] != null) snap[id] = v[0];
  await writeFile(new URL(`${updated}.json`, hdir), JSON.stringify({ usdEur, p: snap }));
  dates.push(updated);
}
await writeFile(new URL("index.json", hdir), JSON.stringify(dates));

console.log(`${cards.length} cartes, ${Object.keys(prices).length} prix, ${sets.length} extensions, 1 USD = ${usdEur} EUR`);
