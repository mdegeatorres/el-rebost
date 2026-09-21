/* El Rebost — còpia local de l'app.
   L'objectiu és poder obrir-la al súper sense cobertura. Les dades ja les
   guarda el Firestore pel seu compte; aquí només es guarda l'app.

   Criteri: la xarxa mana sempre que respongui. Així no et pots quedar mai
   encallada en una versió antiga, que és el risc real d'aquests fitxers.
   La còpia desada només entra quan la xarxa falla o triga massa. */

const CACHE = "rebost-v1";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.json",
               "./icon.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

// Les llibreries de Firebase porten la versió a l'adreça, així que no canvien
// mai: val la pena no tornar-les a baixar. Són el gruix del que es descarrega.
const SDK = /^https:\/\/www\.gstatic\.com\/firebasejs\//;
const ESPERA = 2500;

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const claus = await caches.keys();
    await Promise.all(claus.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function ambLimit(promesa, ms) {
  return new Promise((ok, falla) => {
    const t = setTimeout(() => falla(new Error("massa lent")), ms);
    promesa.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); falla(e); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  if (SDK.test(req.url)) {
    e.respondWith((async () => {
      try {
        const c = await caches.open(CACHE);
        const desat = await c.match(req);
        if (desat) return desat;
        const res = await fetch(req);
        if (res && res.ok) c.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) { return fetch(req); }
    })());
    return;
  }

  // Firestore i l'autenticació no passen per aquí: tenen el seu propi sistema.
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    let c = null;
    try { c = await caches.open(CACHE); } catch (err) {}
    try {
      const res = await ambLimit(fetch(req), ESPERA);
      if (c && res && res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      if (c) {
        const desat = await c.match(req, { ignoreSearch: true });
        if (desat) return desat;
        if (req.mode === "navigate") {
          const portada = await c.match("./index.html");
          if (portada) return portada;
        }
      }
      throw err;
    }
  })());
});
