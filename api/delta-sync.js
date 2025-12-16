// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
let featureMapCache = null;

// ----------------------------------------------------
// Helper: Hash
// ----------------------------------------------------
function createHash(obj) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(obj))
    .digest("hex");
}

// ----------------------------------------------------
// Helper: Webflow Request
// ----------------------------------------------------
async function wf(url, method, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": body ? "application/json" : undefined,
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = res.status !== 204 ? await res.json() : null;
  if (!res.ok) throw json;
  return json;
}

// ----------------------------------------------------
function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// ----------------------------------------------------
// Feature Map (slug → ID)
// ----------------------------------------------------
async function getFeatureMap(token, collectionId) {
  if (featureMapCache) return featureMapCache;

  const data = await wf(
    `${WEBFLOW_BASE}/collections/${collectionId}/items?limit=1000`,
    "GET",
    token
  );

  const map = {};
  for (const item of data.items || []) {
    const slug = item.fieldData?.slug;
    if (slug) map[slug] = item.id;
  }

  featureMapCache = map;
  return map;
}

// ----------------------------------------------------
// API Handler
// ----------------------------------------------------
export default async function handler(req, res) {
  try {
    const {
      WEBFLOW_TOKEN,
      WEBFLOW_COLLECTION,
      WEBFLOW_FEATURES_COLLECTION,
      SYS_API_USER,
      SYS_API_PASS,
    } = process.env;

    const limit = Math.min(parseInt(req.query.limit || "25", 10), 50);
    const offset = parseInt(req.query.offset || "0", 10);
    const dryRun = req.query.dry === "1";

    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    // ------------------------------------------------
    // 1) Syscara Ads
    // ------------------------------------------------
    const sysRes = await fetch("https://api.syscara.com/sale/ads/", {
      headers: { Authorization: auth },
    });

    if (!sysRes.ok) throw await sysRes.text();

    const sysRaw = await sysRes.json();
    const sysAds = Object.values(sysRaw);
    const batch = sysAds.slice(offset, offset + limit);

    const sysMap = new Map();
    for (const ad of sysAds) {
      if (ad?.id) sysMap.set(String(ad.id), ad);
    }

    // ------------------------------------------------
    // 2) Webflow Items
    // ------------------------------------------------
    const wfItems = await wf(
      `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items?limit=1000`,
      "GET",
      WEBFLOW_TOKEN
    );

    const wfMap = new Map();
    for (const item of wfItems.items || []) {
      const fid = item.fieldData?.["fahrzeug-id"];
      if (fid) wfMap.set(String(fid), item);
    }

    // ------------------------------------------------
    // 3) Feature Map
    // ------------------------------------------------
    const featureMap = await getFeatureMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION
    );

    const origin = getOrigin(req);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deleted = 0;

    // ------------------------------------------------
    // 4) CREATE / UPDATE
    // ------------------------------------------------
    for (const ad of batch) {
      const mapped = mapVehicle(ad);

      // 🖼️ Media
      if (mapped["media-cache"]) {
        const cache = JSON.parse(mapped["media-cache"]);

        if (cache.hauptbild)
          mapped.hauptbild = `${origin}/api/media?id=${cache.hauptbild}`;

        if (Array.isArray(cache.galerie))
          mapped.galerie = cache.galerie
            .slice(0, 25)
            .map((id) => `${origin}/api/media?id=${id}`);

        if (cache.grundriss)
          mapped.grundriss = `${origin}/api/media?id=${cache.grundriss}`;
      }

      // 🔗 Features
      const featureIds = (mapped.featureSlugs || [])
        .map((slug) => featureMap[slug])
        .filter(Boolean);

      delete mapped.featureSlugs;
      mapped.features = featureIds;

      // 🔐 Change Detection
      const hash = createHash(mapped);
      mapped["sync-hash"] = hash;

      const existing = wfMap.get(mapped["fahrzeug-id"]);

      // -------- UPDATE
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
            { fieldData: mapped }
          );

          // ✅ PUBLISH (STAGING)
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items/${existing.id}/publish`,
            "POST",
            WEBFLOW_TOKEN,
            { publishToDomains: ["staging"] }
          );
        }

        updated++;
      }
      // -------- CREATE
      else {
        if (!dryRun) {
          const createdItem = await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items`,
            "POST",
            WEBFLOW_TOKEN,
            { items: [{ fieldData: mapped }] }
          );

          const newId = createdItem.items[0].id;

          // ✅ PUBLISH (STAGING)
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items/${newId}/publish`,
            "POST",
            WEBFLOW_TOKEN,
            { publishToDomains: ["staging"] }
          );
        }

        created++;
      }
    }

    // ------------------------------------------------
    // 5) DELETE
    // ------------------------------------------------
    for (const [fid, item] of wfMap.entries()) {
      if (!sysMap.has(fid)) {
        if (!dryRun) {
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items/${item.id}`,
            "DELETE",
            WEBFLOW_TOKEN
          );
        }
        deleted++;
      }
    }

    // ------------------------------------------------
    // 6) Ergebnis
    // ------------------------------------------------
    return res.status(200).json({
      ok: true,
      dryRun,
      batch: { limit, offset },
      syscaraTotal: sysAds.length,
      webflowTotal: wfMap.size,
      created,
      updated,
      skipped,
      deleted,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}

