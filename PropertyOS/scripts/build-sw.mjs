import { readdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
function walk(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? walk(dir + "/" + d.name, prefix + d.name + "/")
      : [prefix + d.name],
  );
}
const files = walk("dist").filter((f) => f !== "sw.js"),
  version = createHash("sha256")
    .update(files.map((f) => readFileSync("dist/" + f)).join(""))
    .digest("hex")
    .slice(0, 12);
writeFileSync(
  "dist/sw.js",
  `const CACHE='propertyos-${version}',FILES=${JSON.stringify(files.map((x) => "./" + x))};self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('propertyos-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):Response.error())));});`,
);
