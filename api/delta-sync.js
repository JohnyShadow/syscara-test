// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const OFFSET_KEY = "delta-sync-offset";
let featureMapCache = null;
let bedMapCache = null;

/* ---------------- HASH ---------------- */
function createHash(obj) {
  return crypto.createHash("sha1").update(JSON.stringify(obj)).digest("hex");
}

/* ---------------- WEBFLOW REQUEST ---------------- */
async function wf(url, method, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = res.status !== 204 ? await res.json() : null;
  if (!res.ok) throw json || (await res.text());
  return json;
}

/* ---------------- FEATURE / BED MAP ---------------- */
async function getMap(token, collectionId, cacheRef) {
  if (cacheRef.value) return cacheRef.value;

  const map = {};
  let offset = 0;

  while (true) {
    const res = await wf(
      `${WEBFLOW_BASE}/collections/${collectionId}/items?limit=100&offset=${offset}`,
      "GET",
      token
    );

    for (const item of res.items || []) {
      const slug = item.fieldData?.slug;
      if (slug) map[slug] = item.id;
    }

    if (!res.items || res.items.length < 100) break;
    offset += 100;
  }

  cacheRef.value = map;
  return map;
}

/* ---------------- API HANDLER ---------------- */
export default async function handler(req, res) {
  try {
    const {
      WEBFLOW_TOKEN,
      WEBFLOW_COLLECTION,
      WEBFLOW_FEATURES_COLLECTION,
      WEBFLOW_BEDS_COLLECTION,
      SYS_API_USER,
      SYS_API_PASS,
    } = process.env;

    const limit = Math.min(parseInt(req.query.limit || "25", 10), 25);
    const dryRun = req.query.dry === "1";

    // ---------------- SYSCARA ----------------
    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    const sysRes = await fetch("https://api.syscara.com/sale/ads/", {
      headers: { Authorization: auth },
    });
    if (!sysRes.ok) throw await sysRes.text();

    const sysAds = Object.values(await sysRes.json())
      .filter((ad) => ad?.store?.zipcode === "24783");

    const batch = sysAds.slice(0, limit);
    const sysMap = new Map(sysAds.map((a) => [String(a.id), a]));

    // ---------------- WEBFLOW ITEMS ----------------
    const wfMap = new Map();
    let wfOffset = 0;

    while (true) {
      const r = await wf(
        `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items?limit=100&offset=${wfOffset}`,
        "GET",
        WEBFLOW_TOKEN
      );

      for (const item of r.items || []) {
        const fid = item.fieldData?.["fahrzeug-id"];
        if (fid) wfMap.set(String(fid), item);
      }

      if (!r.items || r.items.length < 100) break;
      wfOffset += 100;
    }

    // ---------------- MAPS ----------------
    const featureMap = await getMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION,
      { value: featureMapCache }
    );

    const bedMap = await getMap(
      WEBFLOW_TOKEN,
      WEBFLOW_BEDS_COLLECTION,
      { value: bedMapCache }
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // ---------------- SYNC ----------------
    for (const ad of batch) {
      const mapped = mapVehicle(ad);

      // FEATURES
      mapped.features = (mapped.featureSlugs || [])
        .map((s) => featureMap[s])
        .filter(Boolean);
      delete mapped.featureSlugs;

      // BETTEN ✅
      mapped.betten = (mapped.bedSlugs || [])
        .map((s) => bedMap[s])
        .filter(Boolean);
      delete mapped.bedSlugs;

      const hash = createHash(mapped);
      mapped["sync-hash"] = hash;

      const existing = wfMap.get(mapped["fahrzeug-id"]);

      if (existing) {
        if (existing.fieldData?.["sync-hash"] === hash) {
          skipped++;
          continue;
        }

        if (!dryRun) {
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items/${existing.id}`,
            "PATCH",
            WEBFLOW_TOKEN,
            { fieldData: mapped, isDraft: false }
          );
        }
        updated++;
      } else {
        if (!dryRun) {
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items`,
            "POST",
            WEBFLOW_TOKEN,
            { fieldData: mapped, isDraft: false }
          );
        }
        created++;
      }
    }

    return res.status(200).json({
      ok: true,
      created,
      updated,
      skipped,
      totalProcessed: batch.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
