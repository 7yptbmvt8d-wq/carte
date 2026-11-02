// Ma Collection DBS — application locale (PWA), aucune donnée envoyée à un serveur.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const IMG = (id, big) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_${big ? "in_1000x1000" : "400w"}.jpg`;
const GAME = { fw: "Fusion World", masters: "Masters" };
const CONDS = ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"];
const LANGS = ["EN", "JP", "FR", "Autre"];
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const fmtDate = (d) => d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Stockage local ----------
const KEY = "dbcol.v1";
const blank = () => ({ items: [], hist: {}, rates: {}, lastSnap: "", settings: { currency: "EUR", period: 180 } });
let store;
try { store = { ...blank(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { store = blank(); }
store.settings = { ...blank().settings, ...store.settings };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { toast("Stockage plein : exporte puis supprime des photos."); } };

const idb = (() => {
  let p;
  const open = () => (p ??= new Promise((res, rej) => {
    const r = indexedDB.open("dbcol", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction("photos", mode); const q = fn(t.objectStore("photos"));
      t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error);
    });
  };
  return { get: (k) => tx("readonly", (s) => s.get(k)), set: (k, v) => tx("readwrite", (s) => s.put(v, k)), del: (k) => tx("readwrite", (s) => s.delete(k)) };
})();
const photoUrls = new Map();
async function photoUrl(key) {
  if (photoUrls.has(key)) return photoUrls.get(key);
  const b = await idb.get(key).catch(() => null);
  const u = b ? URL.createObjectURL(b) : null; photoUrls.set(key, u); return u;
}

// ---------- Données cartes / prix ----------
let cards = [], byId = new Map(), byKey = new Map(), sets = new Map(), prices = { p: {}, usdEur: 0.9, updated: "" };
const hist = { dates: null, snaps: new Map() };

function norm(s) {
  s = String(s).toUpperCase().trim().replace(/[\s_]+S?PR$/, "").replace(/\s+/g, "").replace(/[–—_]/g, "-");
  const m = s.match(/^([A-Z]+)(\d*)-([A-Z]*)(\d+)$/) || s.match(/^([A-Z]+)(\d{0,2}?)()(\d{3})$/);
  return m ? `${m[1]}${m[2] ? +m[2] : ""}-${m[3]}${+m[4]}` : s;
}

async function loadData() {
  const [c, p] = await Promise.all([fetch("data/cards.json").then((r) => r.json()), fetch("data/prices.json").then((r) => r.json())]);
  cards = c.cards; prices = p;
  for (const s of c.sets) sets.set(s.id, s);
  for (const x of cards) {
    byId.set(x.id, x);
    const k = norm(x.n); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(x);
  }
  snapshot();
}

// Point d'historique local à chaque nouvelle mise à jour des prix
function snapshot() {
  const d = prices.updated; if (!d) return;
  store.rates[d] = prices.usdEur;
  for (const id of new Set(store.items.map((i) => i.id))) addPoint(id, d);
  store.lastSnap = d; save();
}
function addPoint(id, d = prices.updated) {
  const usd = prices.p[id]?.[0]; if (usd == null || !d) return;
  const h = (store.hist[id] ??= []);
  if (h.at(-1)?.[0] === d) h[h.length - 1] = [d, usd]; else h.push([d, usd]);
}

async function loadServerHist(from) {
  if (!hist.dates) hist.dates = await fetch("data/history/index.json").then((r) => r.json()).catch(() => []);
  const need = hist.dates.filter((d) => d >= from && !hist.snaps.has(d));
  await Promise.all(need.map(async (d) => hist.snaps.set(d, await fetch(`data/history/${d}.json`).then((r) => r.json()).catch(() => null))));
}

// ---------- Valeurs ----------
const rate = () => prices.usdEur || 0.9;
const marketEUR = (id) => { const v = prices.p[id]; const u = v ? v[0] ?? v[2] ?? v[1] : null; return u == null ? null : u * rate(); };
const unitEUR = (it) => (it.manual != null && it.manual !== "" ? +it.manual : marketEUR(it.id));
function money(eur, dec = 2) {
  if (eur == null || isNaN(eur)) return "—";
  const usd = store.settings.currency === "USD";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: usd ? "USD" : "EUR", minimumFractionDigits: dec, maximumFractionDigits: dec }).format(usd ? eur / rate() : eur);
}
const pct = (x) => (x == null || !isFinite(x) ? "" : (x >= 0 ? "+" : "") + (x * 100).toFixed(1).replace(".", ",") + " %");
const signCls = (x) => (x > 0 ? "up" : x < 0 ? "down" : "muted");
const fromDate = () => (store.settings.period ? daysAgo(store.settings.period) : "0000");

function cardPoints(id, from = fromDate()) {
  const m = new Map();
  for (const [d, s] of hist.snaps) if (s && d >= from && s.p[id] != null) m.set(d, s.p[id] * (s.usdEur || rate()));
  for (const [d, usd] of store.hist[id] || []) if (d >= from) m.set(d, usd * (store.rates[d] ?? rate()));
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}
function change(it) {
  if (it.manual != null && it.manual !== "") return null;
  const pts = cardPoints(it.id); if (pts.length < 2 || !pts[0][1]) return null;
  return { abs: pts.at(-1)[1] - pts[0][1], rel: (pts.at(-1)[1] - pts[0][1]) / pts[0][1] };
}
function totalSeries() {
  const from = fromDate(), per = store.items.map((it) => [it, cardPoints(it.id, from)]);
  const dates = [...new Set(per.flatMap(([, p]) => p.map((x) => x[0])))].sort();
  return dates.map((d) => {
    let t = 0;
    for (const [it, pts] of per) {
      let v = unitEUR(it);
      if (!(it.manual != null && it.manual !== "") && pts.length) { v = pts[0][1]; for (const [pd, pv] of pts) if (pd <= d) v = pv; }
      t += (v || 0) * it.qty;
    }
    return [d, t];
  });
}

// ---------- Graphiques ----------
const charts = {};
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function lineChart(key, canvas, pts) {
  charts[key]?.destroy();
  if (!window.Chart || pts.length < 2) return false;
  const accent = css("--accent");
  charts[key] = new Chart(canvas, {
    type: "line",
    data: { labels: pts.map((p) => fmtDate(p[0]).slice(0, 5)), datasets: [{ data: pts.map((p) => p[1]), borderColor: accent, backgroundColor: accent + "22", fill: true, tension: 0.25, borderWidth: 2, pointRadius: pts.length < 25 ? 2 : 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { intersect: false, mode: "index" },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => fmtDate(pts[c[0].dataIndex][0]), label: (c) => money(c.parsed.y) } } },
      scales: {
        x: { ticks: { maxTicksLimit: 5, color: css("--muted") }, grid: { display: false } },
        y: { ticks: { maxTicksLimit: 4, color: css("--muted"), callback: (v) => money(v, 0) }, grid: { color: css("--border") } },
      },
    },
  });
  return true;
}

// ---------- Vue Collection ----------
async function renderCollection() {
  const items = store.items;
  let total = 0, cost = 0, costVal = 0, n = 0;
  for (const it of items) {
    const v = (unitEUR(it) || 0) * it.qty; total += v; n += it.qty;
    if (it.buy != null && it.buy !== "") { cost += +it.buy * it.qty; costVal += v; }
  }
  $("#total").textContent = money(total);
  $("#counts").textContent = `${n} carte${n > 1 ? "s" : ""} · ${items.length} réf.`;
  const pl = costVal - cost;
  $("#pl").innerHTML = cost ? `<span class="muted">Investi ${money(cost)}</span><span class="${signCls(pl)}">Plus-value ${pl >= 0 ? "+" : ""}${money(pl)} (${pct(pl / cost)})</span>` : "";
  $$("#periods button").forEach((b) => b.classList.toggle("on", +b.dataset.p === store.settings.period));

  const series = totalSeries();
  if (series.length) series[series.length - 1][1] = total;
  const ok = lineChart("total", $("#chart-total"), series);
  $("#chart-total").parentElement.hidden = !ok;
  $("#chart-empty").hidden = ok || !items.length;
  if (series.length >= 2) {
    const d = series.at(-1)[1] - series[0][1];
    $("#delta").innerHTML = `<span class="${signCls(d)}">${d >= 0 ? "+" : ""}${money(d)} (${pct(series[0][1] ? d / series[0][1] : null)})</span> <span class="muted">depuis le ${fmtDate(series[0][0])}</span>`;
  } else $("#delta").textContent = "";

  // Plus fortes hausses / baisses
  const ch = items.map((it) => [it, change(it)]).filter(([it, c]) => c && (unitEUR(it) || 0) >= 0.5 && c.rel !== 0);
  const up = ch.filter(([, c]) => c.rel > 0).sort((a, b) => b[1].rel - a[1].rel).slice(0, 3);
  const dn = ch.filter(([, c]) => c.rel < 0).sort((a, b) => a[1].rel - b[1].rel).slice(0, 3);
  const mv = (arr) => arr.map(([it, c]) => `<div class="mover" data-uid="${it.uid}"><span>${esc(byId.get(it.id)?.name ?? it.id)}</span><span class="${signCls(c.rel)}">${pct(c.rel)}</span></div>`).join("") || `<div class="muted small">—</div>`;
  $("#movers").innerHTML = ch.length ? `<div class="card-box"><h3>Hausses</h3>${mv(up)}</div><div class="card-box"><h3>Baisses</h3>${mv(dn)}</div>` : "";

  renderGrid();
}

function renderGrid() {
  const q = $("#filter").value.trim().toLowerCase(), g = $("#game-filter").value, sort = $("#sort").value;
  let list = store.items.map((it) => ({ it, c: byId.get(it.id), v: unitEUR(it) }));
  if (g) list = list.filter((x) => x.c?.g === g);
  if (q) list = list.filter((x) => `${x.c?.name} ${x.c?.n} ${sets.get(x.c?.s)?.name} ${x.c?.r} ${x.it.note ?? ""}`.toLowerCase().includes(q));
  const plOf = (x) => (x.it.buy != null && x.it.buy !== "" ? ((x.v || 0) - x.it.buy) * x.it.qty : -Infinity);
  const sorters = {
    value: (a, b) => (b.v || 0) * b.it.qty - (a.v || 0) * a.it.qty,
    added: (a, b) => (b.it.added || "").localeCompare(a.it.added || ""),
    number: (a, b) => (a.c?.n || "").localeCompare(b.c?.n || "", "fr", { numeric: true }),
    change: (a, b) => (change(b.it)?.rel ?? -Infinity) - (change(a.it)?.rel ?? -Infinity),
    pl: (a, b) => plOf(b) - plOf(a),
  };
  list.sort(sorters[sort]);
  $("#empty").hidden = store.items.length > 0;
  $("#grid").innerHTML = list.map(({ it, c, v }) => {
    const chg = change(it);
    return `<div class="tile" data-uid="${it.uid}">
      ${it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : ""}
      <img loading="lazy" alt="" src="${IMG(it.id)}" data-photo="${it.photo ? it.uid : ""}">
      <div class="info">
        <div class="name">${esc(c?.name ?? "Carte inconnue")}</div>
        <div class="meta">${esc(c?.n ?? "")} · ${esc(c?.r ?? "")}</div>
        <div class="price"><span>${money(v)}</span>${chg ? `<span class="badge ${signCls(chg.rel)}">${pct(chg.rel)}</span>` : ""}</div>
      </div></div>`;
  }).join("");
  $$("#grid img[data-photo]:not([data-photo=''])").forEach(async (img) => { const u = await photoUrl(img.dataset.photo); if (u) img.src = u; });
}

// ---------- Recherche / ajout ----------
function search(q) {
  q = q.trim(); if (!q) return [];
  const exact = byKey.get(norm(q));
  if (exact) return exact;
  if (q.length < 3) return [];
  const Q = q.toUpperCase(), ql = q.toLowerCase();
  return cards.filter((c) => c.n.toUpperCase().includes(Q) || c.name.toLowerCase().includes(ql)).slice(0, 80);
}
function renderResults(list, msg) {
  if (!list.length) { $("#results").innerHTML = `<p class="muted">${msg ?? "Aucune carte trouvée. Vérifie le numéro (ex. FB01-001, BT1-031, P-123)."}</p>`; return; }
  $("#results").innerHTML = (list.length > 1 ? `<p class="muted small">${list.length} résultat(s) — choisis la bonne version :</p>` : "") +
    list.map((c) => {
      const s = sets.get(c.s), owned = store.items.filter((i) => i.id === c.id).reduce((a, i) => a + i.qty, 0);
      return `<div class="result" data-id="${c.id}">
        <img loading="lazy" alt="" src="${IMG(c.id)}">
        <div class="grow"><div class="name">${esc(c.name)}</div>
          <div class="muted small">${esc(c.n)} · ${esc(c.r)} · ${esc(GAME[c.g])}</div>
          <div class="muted small">${esc(s?.name ?? "")}${owned ? ` · <b>${owned} possédée(s)</b>` : ""}</div></div>
        <div class="price">${money(marketEUR(c.id))}</div></div>`;
    }).join("");
}

// ---------- Fiche carte (ajout / édition) ----------
let scanBlob = null;
async function openSheet({ id, uid: u }) {
  const existing = u ? store.items.find((i) => i.uid === u) : null;
  const it = existing ?? { id, qty: 1, cond: "Near Mint", lang: "EN", buy: "", buyDate: today(), manual: "", note: "" };
  const c = byId.get(it.id), s = sets.get(c?.s), v = prices.p[it.id] || [];
  const unit = unitEUR(it), own = it.photo ? await photoUrl(it.uid) : null;
  const plv = existing && it.buy !== "" && it.buy != null ? ((unit || 0) - it.buy) * it.qty : null;
  const opt = (arr, cur) => arr.map((x) => `<option ${x === cur ? "selected" : ""}>${x}</option>`).join("");

  $("#sheet-body").innerHTML = `
    <div class="sheet-head"><div><h2 style="margin:0">${esc(c?.name ?? "Carte")}</h2>
      <div class="muted small">${esc(c?.n)} · ${esc(c?.r)} · ${esc(GAME[c?.g])}<br>${esc(s?.name ?? "")}${s?.code ? ` (${esc(s.code)})` : ""}</div></div>
      <button class="close" data-close aria-label="Fermer">×</button></div>
    <img class="detail-img" id="d-img" alt="" src="${own ?? IMG(it.id, true)}">
    ${own ? `<div class="img-switch"><button class="chip" data-img="off">Illustration officielle</button><button class="chip" data-img="own">Ma photo</button></div>` : ""}
    <div class="stats">
      <div class="stat"><b>${money(unit)}</b><span>${it.manual !== "" && it.manual != null ? "Prix manuel" : "Prix marché"}</span></div>
      <div class="stat"><b>${money(v[1] != null ? v[1] * rate() : null)}</b><span>Plus bas</span></div>
      <div class="stat"><b>${existing ? money((unit || 0) * it.qty) : money(v[2] != null ? v[2] * rate() : null)}</b><span>${existing ? `Total ×${it.qty}` : "Médian"}</span></div>
    </div>
    ${plv != null ? `<div class="row small"><span class="muted">Plus-value</span><b class="${signCls(plv)}">${plv >= 0 ? "+" : ""}${money(plv)} (${pct(plv / (it.buy * it.qty))})</b></div>` : ""}
    <div class="chart-wrap" style="height:150px;margin-top:8px"><canvas id="chart-card"></canvas></div>
    <p class="muted small" id="card-chart-empty" hidden>Historique en cours de constitution.</p>
    <form class="form" id="item-form">
      <label class="field">Quantité<input name="qty" type="number" min="1" step="1" value="${it.qty}" required></label>
      <label class="field">État<select name="cond">${opt(CONDS, it.cond)}</select></label>
      <label class="field">Langue<select name="lang">${opt(LANGS, it.lang)}</select></label>
      <label class="field">Prix d'achat unitaire (€)<input name="buy" type="number" min="0" step="0.01" inputmode="decimal" value="${it.buy ?? ""}"></label>
      <label class="field">Date d'achat<input name="buyDate" type="date" value="${it.buyDate ?? ""}"></label>
      <label class="field">Prix manuel (€)<input name="manual" type="number" min="0" step="0.01" inputmode="decimal" placeholder="ex. Cardmarket" value="${it.manual ?? ""}"></label>
      <label class="field full">Notes<textarea name="note" rows="2">${esc(it.note)}</textarea></label>
      <label class="field full">Ma photo de la carte<input name="photo" type="file" accept="image/*"></label>
      ${!existing && scanBlob ? `<label class="field full" style="flex-direction:row;display:flex;gap:8px;align-items:center"><input type="checkbox" name="useScan" checked> Utiliser la photo scannée</label>` : ""}
      ${existing && it.photo ? `<label class="field full" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="delPhoto"> Supprimer ma photo</label>` : ""}
    </form>
    <div class="actions">
      ${existing ? `<button class="btn danger" id="del">Supprimer</button>` : ""}
      <a class="btn" href="https://www.tcgplayer.com/product/${it.id}" target="_blank" rel="noopener">TCGplayer ↗</a>
      <a class="btn" href="https://www.cardmarket.com/fr/DragonBallSuper/Products/Search?searchString=${encodeURIComponent(c?.n ?? "")}" target="_blank" rel="noopener">Cardmarket ↗</a>
      <button class="btn primary" id="save">${existing ? "Enregistrer" : "Ajouter à la collection"}</button>
    </div>`;
  $("#sheet").showModal();

  $$("[data-img]").forEach((b) => b.onclick = () => ($("#d-img").src = b.dataset.img === "own" ? own : IMG(it.id, true)));
  $("#save").onclick = () => saveItem(existing, it);
  if (existing) $("#del").onclick = async () => {
    if (!confirm("Supprimer cette carte de la collection ?")) return;
    store.items = store.items.filter((i) => i.uid !== existing.uid);
    if (existing.photo) idb.del(existing.uid).catch(() => {});
    save(); $("#sheet").close(); renderCollection(); toast("Carte supprimée");
  };
  await loadServerHist(fromDate());
  const pts = cardPoints(it.id);
  const ok = $("#sheet").open && lineChart("card", $("#chart-card"), pts);
  if ($("#chart-card")) { $("#chart-card").parentElement.hidden = !ok; $("#card-chart-empty").hidden = !!ok; }
}

async function resizeImage(blob, max = 900) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
}

async function saveItem(existing, base) {
  const f = $("#item-form"); if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const num = (k) => (fd.get(k) === "" ? "" : Math.round(+fd.get(k) * 100) / 100);
  const data = { qty: Math.max(1, parseInt(fd.get("qty")) || 1), cond: fd.get("cond"), lang: fd.get("lang"), buy: num("buy"), buyDate: fd.get("buyDate"), manual: num("manual"), note: fd.get("note").trim() };
  let it;
  if (existing) { it = Object.assign(existing, data); }
  else {
    const twin = store.items.find((i) => i.id === base.id && i.cond === data.cond && i.lang === data.lang && !i.photo);
    const file = fd.get("photo");
    if (twin && !(file && file.size) && !fd.get("useScan")) { twin.qty += data.qty; it = twin; toast(`Quantité mise à jour (×${twin.qty})`); }
    else { it = { uid: uid(), id: base.id, added: new Date().toISOString(), ...data }; store.items.push(it); toast("Carte ajoutée"); }
    addPoint(it.id);
  }
  const file = fd.get("photo");
  const blob = file && file.size ? file : !existing && fd.get("useScan") ? scanBlob : null;
  if (blob) { await idb.set(it.uid, await resizeImage(blob)); it.photo = true; photoUrls.delete(it.uid); }
  else if (fd.get("delPhoto")) { await idb.del(it.uid); it.photo = false; photoUrls.delete(it.uid); }
  save(); $("#sheet").close(); renderCollection();
  if (!existing) renderResults(search($("#q").value));
}

// ---------- Scan (OCR du numéro) ----------
const loadScript = (src) => new Promise((res, rej) => { if ([...document.scripts].some((s) => s.src === src)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

function prepCanvas(bmp, sy, sh, width = 1600) {
  const sw = bmp.width, k = width / sw;
  const cv = Object.assign(document.createElement("canvas"), { width, height: Math.round(sh * k) });
  const ctx = cv.getContext("2d");
  ctx.filter = "grayscale(1) contrast(1.6)";
  ctx.drawImage(bmp, 0, sy, sw, sh, 0, 0, cv.width, cv.height);
  return cv;
}
function candidates(text) {
  const out = new Set();
  const t = text.toUpperCase().replace(/[–—_~]/g, "-");
  // Confusions OCR fréquentes : O/0, I/L/1, S/5, B/8, Z/2
  const dig = (s) => s.replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
  const let_ = (s) => s.replace(/0/g, "O").replace(/1/g, "I").replace(/5/g, "S").replace(/8/g, "B").replace(/2/g, "Z");
  for (const m of t.matchAll(/([A-Z0-9|]{1,5})\s?-\s?([A-Z0-9|]{2,5})/g)) {
    const [L, R] = [m[1], m[2]];
    for (let i = 1; i <= Math.min(3, L.length); i++) {
      const pre = let_(L.slice(0, i)), set = dig(L.slice(i));
      if (!/^[A-Z]+$/.test(pre) || !/^\d{0,2}$/.test(set)) continue;
      for (let j = 0; j <= Math.min(2, R.length - 2); j++) {
        const k = norm(`${pre}${set}-${let_(R.slice(0, j))}${dig(R.slice(j))}`);
        if (byKey.has(k)) out.add(k);
      }
    }
  }
  return [...out];
}
async function scan(file) {
  scanBlob = file;
  const st = $("#scan-status");
  $("#scan-preview").innerHTML = `<img alt="" src="${URL.createObjectURL(file)}">`;
  $("#results").innerHTML = "";
  try {
    st.textContent = "Chargement de la reconnaissance de texte…";
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
    const bmp = await createImageBitmap(file);
    const worker = await Tesseract.createWorker("eng");
    await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" });
    const zones = [[0.62, 0.38], [0, 1], [0, 0.4]]; // bas de la carte, carte entière, haut (carte retournée)
    let found = [];
    for (const [i, [y, h]] of zones.entries()) {
      st.textContent = `Lecture du numéro… (${i + 1}/${zones.length})`;
      const { data } = await worker.recognize(prepCanvas(bmp, Math.round(bmp.height * y), Math.round(bmp.height * h)));
      found = candidates(data.text);
      if (found.length) break;
    }
    await worker.terminate();
    if (!found.length) { st.textContent = "Numéro non reconnu. Saisis-le ci-dessus (la photo sera proposée comme illustration)."; return; }
    const label = (k) => byKey.get(k)[0].n.replace(/[_ ]S?PR$/, "");
    st.innerHTML = found.length > 1 ? `Numéros détectés : <span class="chips">${found.map((k) => `<button class="chip" data-k="${k}">${esc(label(k))}</button>`).join("")}</span>` : `Numéro détecté : <b>${esc(label(found[0]))}</b>`;
    $$("#scan-status [data-k]").forEach((b) => b.onclick = () => { $("#q").value = label(b.dataset.k); renderResults(search(b.dataset.k)); });
    $("#q").value = label(found[0]); renderResults(search(found[0]));
  } catch (e) {
    console.error(e); st.textContent = "Reconnaissance indisponible (connexion requise au premier usage). Saisis le numéro manuellement.";
  }
}

// ---------- Import / export ----------
const download = (name, data, type) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([data], { type })), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const blobToDataURL = (b) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function exportJSON() {
  const photos = {};
  for (const it of store.items) if (it.photo) { const b = await idb.get(it.uid).catch(() => null); if (b) photos[it.uid] = await blobToDataURL(b); }
  download(`collection-dbs-${today()}.json`, JSON.stringify({ app: "dbcol", version: 1, ...store, photos }), "application/json");
}
async function importJSON(file) {
  try {
    const d = JSON.parse(await file.text()); if (!Array.isArray(d.items)) throw 0;
    if (!confirm(`Remplacer la collection actuelle par ${d.items.length} référence(s) ?`)) return;
    for (const [k, url] of Object.entries(d.photos || {})) await idb.set(k, await (await fetch(url)).blob());
    delete d.photos; store = { ...blank(), ...d, settings: { ...blank().settings, ...d.settings } };
    photoUrls.clear(); snapshot(); save(); renderCollection(); toast("Collection importée");
  } catch { toast("Fichier invalide"); }
}
function exportCSV() {
  const rows = [["Numéro", "Nom", "Jeu", "Extension", "Rareté", "Quantité", "État", "Langue", "Prix achat (€)", "Date achat", "Valeur unitaire (€)", "Valeur totale (€)", "Notes"]];
  for (const it of store.items) {
    const c = byId.get(it.id) || {}, u = unitEUR(it);
    rows.push([c.n, c.name, GAME[c.g], sets.get(c.s)?.name, c.r, it.qty, it.cond, it.lang, it.buy, it.buyDate, u?.toFixed(2), u != null ? (u * it.qty).toFixed(2) : "", it.note]);
  }
  download(`collection-dbs-${today()}.csv`, "﻿" + rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\n"), "text/csv");
}

// ---------- Navigation / UI ----------
const TITLES = { collection: "Collection", add: "Ajouter une carte", settings: "Réglages" };
function go(v) {
  $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.goto === v));
  $("#title").textContent = TITLES[v];
  if (v === "add") setTimeout(() => $("#q").focus(), 50);
  if (v === "collection") renderCollection();
  window.scrollTo(0, 0);
}
let toastT;
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200); }

document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]"); if (g) return go(g.dataset.goto);
  const tile = e.target.closest(".tile, .mover"); if (tile) return openSheet({ uid: tile.dataset.uid });
  const r = e.target.closest(".result"); if (r) return openSheet({ id: +r.dataset.id });
  if (e.target.closest("[data-close]") || e.target === $("#sheet")) $("#sheet").close();
});
$("#sheet").addEventListener("close", () => charts.card?.destroy());
$("#search-form").onsubmit = (e) => { e.preventDefault(); scanBlob = null; $("#scan-preview").innerHTML = ""; $("#scan-status").textContent = ""; renderResults(search($("#q").value)); };
$("#scan-input").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) scan(f); };
["#filter", "#sort", "#game-filter"].forEach((s) => $(s).addEventListener("input", renderGrid));
$("#periods").onclick = async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  store.settings.period = +b.dataset.p; save();
  await loadServerHist(fromDate()); renderCollection();
};
$("#currency").value = store.settings.currency;
$("#currency").onchange = (e) => { store.settings.currency = e.target.value; save(); renderCollection(); };
$("#export").onclick = exportJSON;
$("#export-csv").onclick = exportCSV;
$("#import").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importJSON(f); };
$("#reset").onclick = () => { if (confirm("Effacer toute la collection de cet appareil ? (exporte-la avant)")) { store = blank(); save(); renderCollection(); toast("Collection effacée"); } };

// ---------- Démarrage ----------
(async () => {
  try { await loadData(); }
  catch { toast("Données indisponibles — vérifie ta connexion."); }
  $("#updated").textContent = prices.updated ? `Prix du ${fmtDate(prices.updated)}` : "";
  $("#data-info").textContent = `${cards.length.toLocaleString("fr-FR")} cartes référencées · prix du ${fmtDate(prices.updated)} · 1 $ = ${rate().toFixed(4).replace(".", ",")} €`;
  renderCollection();
  await loadServerHist(fromDate()); renderCollection();
})();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
