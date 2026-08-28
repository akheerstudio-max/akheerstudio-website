// Auto-sync Akheer Studio games from the Google Play developer page into games.json.
// Runs in GitHub Actions on a schedule. Only ADDS newly found games; never deletes
// existing entries and never overwrites manual fields — so a bad scrape can't wipe data.
import { readFile, writeFile } from "node:fs/promises";

const DEV_ID = "9037518238182163411";
const DEV_URL = `https://play.google.com/store/apps/dev?id=${DEV_ID}&hl=en&gl=US`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.text();
}

function extractPkgs(html) {
  const set = new Set();
  const re = /\/store\/apps\/details\?id=([a-zA-Z0-9._]+)/g;
  let m;
  while ((m = re.exec(html))) set.add(m[1]);
  return [...set];
}

function firstMatch(html, re) { const m = html.match(re); return m ? m[1] : null; }

function cleanIcon(url) {
  if (!url) return null;
  // Google usercontent icon URLs carry a size suffix after "="; the site re-adds =s256/=s512.
  return url.split("=")[0];
}

async function getAppMeta(pkg) {
  const html = await get(`https://play.google.com/store/apps/details?id=${pkg}&hl=en&gl=US`);
  let title = firstMatch(html, /<meta property="og:title" content="([^"]+)"/);
  if (title) title = title.replace(/\s*[-–]\s*Apps on Google Play\s*$/i, "").trim();
  const icon = cleanIcon(firstMatch(html, /<meta property="og:image" content="([^"]+)"/));
  return { title, icon };
}

async function main() {
  const data = JSON.parse(await readFile("games.json", "utf8"));
  const existing = new Set(data.games.map((g) => g.pkg));

  let html;
  try { html = await get(DEV_URL); }
  catch (e) { console.error("Dev page fetch failed:", e.message, "— skipping, no changes."); return; }

  const pkgs = extractPkgs(html).filter((p) => p.startsWith("com.akheerstudio") || p.startsWith("com.AkheerStudio"));
  if (pkgs.length === 0) {
    console.log("No Akheer packages found on dev page (structure may have changed) — skipping, no changes.");
    return;
  }
  console.log("Found", pkgs.length, "Akheer app(s) on dev page.");

  let added = 0;
  for (const pkg of pkgs) {
    if (existing.has(pkg)) continue;
    try {
      const meta = await getAppMeta(pkg);
      if (!meta.title || !meta.icon) { console.log("Skip (no title/icon):", pkg); continue; }
      data.games.push({
        pkg,
        title: meta.title,
        icon: meta.icon,
        cat: "action",
        catLabel: "New",
        rating: null,
        badge: "FREE",
        featured: false
      });
      existing.add(pkg);
      added++;
      console.log("Added:", pkg, "-", meta.title);
    } catch (e) {
      console.log("Error fetching meta for", pkg, "-", e.message);
    }
  }

  if (added > 0) {
    await writeFile("games.json", JSON.stringify(data, null, 2) + "\n");
    console.log("Wrote games.json with", added, "new game(s).");
  } else {
    console.log("No new games to add.");
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(0); });
