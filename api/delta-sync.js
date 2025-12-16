// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
let featureMapCache = null;

// ----------------------------------------------------
// Helper: Webflow Request
// ----------------------------------------------------
async function wf(url, method, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const json = await res.json();
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

    const limit = Math.min(parseInt(req.query.limit || "50", 10), 50);
    const offset = parseInt(req.query.offset || "0", 10);
    const dryRun = req.query.dryRun === "true";

    if (
      !WEBFLOW_TOKEN ||
      !WEBFLOW_COLLECTION ||
      !WEBFLOW_FEATURES_COLLECTION ||
      !SYS_API_USER ||
      !SYS_API_PASS
    ) {
      return res.status(500).json({ error: "Missing ENV vars" });
    }

    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    // ------------------------------------------------
    // 1) Syscara Ads laden
    // ------------------------------------------------
    const sysRes = await fetch("https://api.syscara.com/sale/ads/", {
      headers: { Authorization: auth },
    });

    if (!sysRes.ok) throw await sysRes.text();

    const rawAds = await sysRes.json();
    const sysVehicles = Object.values(rawAds);

    const sysMap = new Map();
    for (const ad of sysVehicles) {
      if (ad?.id) sysMap.set(String(ad.id), ad);
    }

    // ------------------------------------------------
    // 2) Webflow Items laden
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
    let deleted = 0;

    // ------------------------------------------------
    // 4) CREATE / UPDATE (Batch)
    // ------------------------------------------------
    const batch = Array.from(sysMap.entries()).slice(
      offset,
      offset + limit
    );

    for (const [id, ad] of batch) {
      const mapped = mapVehicle(ad);

      // Bilder aus media-cache
      if (mapped["media-cache"]) {
        const cache = JSON.parse(mapped["media-cache"]);

        if (cache.hauptbild) {
          mapped.hauptbild = `${origin}/api/media?id=${cache.hauptbild}`;
        }

        if (Array.isArray(cache.galerie)) {
          mapped.galerie = cache.galerie
            .slice(0, 25)
            .map((mid) => `${origin}/api/media?id=${mid}`);
        }

        if (cache.grundriss) {
          mapped.grundriss = `${origin}/api/media?id=${cache.grundriss}`;
        }
      }

      // Features
      const featureIds = (mapped.featureSlugs || [])
        .map((slug) => featureMap[slug])
        .filter(Boolean);

      delete mapped.featureSlugs;
      mapped.features = featureIds;

      if (wfMap.has(id)) {
        updated++;
        if (!dryRun) {
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items/${wfMap.get(id).id}?live=true`,
            "PATCH",
            WEBFLOW_TOKEN,
            { fieldData: mapped }
          );
        }
      } else {
        created++;
        if (!dryRun) {
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items?live=true`,
            "POST",
            WEBFLOW_TOKEN,
            { items: [{ fieldData: mapped }] }
          );
        }
      }
    }

    // ------------------------------------------------
    // 5) DELETE (nicht mehr bei Syscara)
    // ------------------------------------------------
    for (const [fid, item] of wfMap.entries()) {
      if (!sysMap.has(fid)) {
        deleted++;
        if (!dryRun) {
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items/${item.id}`,
            "DELETE",
            WEBFLOW_TOKEN
          );
        }
      }
    }

    // ------------------------------------------------
    // 6) Ergebnis
    // ------------------------------------------------
    return res.status(200).json({
      ok: true,
      dryRun,
      batch: { limit, offset },
      syscaraTotal: sysMap.size,
      webflowTotal: wfMap.size,
      created,
      updated,
      deleted,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err });
  }
}
