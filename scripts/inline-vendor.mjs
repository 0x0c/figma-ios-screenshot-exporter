// Downloads JSZip and inlines it into ui.html so the plugin needs no network access.
// Run with: npm run vendor:jszip
import { readFileSync, writeFileSync } from "node:fs";

const JSZIP_VERSION = "3.10.1";
const JSZIP_URL = `https://cdnjs.cloudflare.com/ajax/libs/jszip/${JSZIP_VERSION}/jszip.min.js`;
const VENDOR_PATH = "vendor/jszip.min.js";
const UI_PATH = "ui.html";

const res = await fetch(JSZIP_URL);
if (!res.ok) throw new Error(`Failed to download JSZip: ${res.status}`);
const js = await res.text();
writeFileSync(VENDOR_PATH, js);

const block =
  `<!-- vendored: JSZip ${JSZIP_VERSION} (MIT). Source: ${VENDOR_PATH}. Re-inline with: npm run vendor:jszip -->\n` +
  `<script>\n${js}\n</script>`;

let html = readFileSync(UI_PATH, "utf8");

// Replace either the existing inlined block or the original CDN <script> tag.
const inlined = /<!-- vendored: JSZip[\s\S]*?<\/script>/;
const cdn = /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/[^"]*"><\/script>/;

if (inlined.test(html)) html = html.replace(inlined, block);
else if (cdn.test(html)) html = html.replace(cdn, block);
else throw new Error("Could not find a JSZip script tag to replace in ui.html");

writeFileSync(UI_PATH, html);
console.log(`Inlined JSZip ${JSZIP_VERSION} into ${UI_PATH}`);
