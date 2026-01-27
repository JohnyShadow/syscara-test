// pages/api/sync.js
import mapVehicle from "../libs/map.js";

let featureMapCache = null;

// ----------------------------------------------------
// Helper: Webflow GET
// ----------------------------------------------------
async function webflowRequest(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  const json = await res.json();
  if (!res.ok) throw json;
  return json;
}

// ----------------------------------------------------
// Feature Map (slug -> ID)
// ----------------------------------------------------
async function getFeatureMap(token, collectionId) {
  if (featureMapCache) return featureMapCache;

  const url = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=1000`;
  const data = await webflowRequest(url, token);

  const map = {};
  for (const item of data.items || []) {
    const slug = item.fieldData?.slug;
    if (slug) map[slug] = item.id;
  }

  featureMapCache = map;
  return map;
}

// ----------------------------------------------------
function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// ----------------------------------------------------
// API Handler (BATCH SYNC)
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

    if (
      !WEBFLOW_TOKEN ||
      !WEBFLOW_COLLECTION ||
      !WEBFLOW_FEATURES_COLLECTION ||
      !SYS_API_USER ||
      !SYS_API_PASS
    ) {
      return res.status(500).json({ error: "Missing ENV vars" });
    }

    // --------------------------------------------
    // Batch Parameter
    // --------------------------------------------
    const limit = Math.min(parseInt(req.query.limit || "5", 10), 25);
    const offset = parseInt(req.query.offset || "0", 10);

    // --------------------------------------------
    // Syscara: alle Ads laden
    // --------------------------------------------
    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    const adsRes = await fetch("https://api.syscara.com/sale/ads/", {
      headers: { Authorization: auth },
    });

    if (!adsRes.ok) {
      const text = await adsRes.text();
      return res.status(500).json({ error: "Syscara error", details: text });
    }

    const adsRaw = await adsRes.json();
    const ads = Object.values(adsRaw);

    const batch = ads.slice(offset, offset + limit);

    // --------------------------------------------
    // Feature Map laden
    // --------------------------------------------
    const featureMap = await getFeatureMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION
    );

    const origin = getOrigin(req);

    const results = [];

    // --------------------------------------------
    // Batch verarbeiten
    // --------------------------------------------
    for (const ad of batch) {
      try {
        const mapped = mapVehicle(ad);

        // ------------------------------
        // Bilder aus media-cache
        // ------------------------------
        if (mapped["media-cache"]) {
          const cache = JSON.parse(mapped["media-cache"]);

          if (cache.hauptbild) {
            mapped.hauptbild = `${origin}/api/media?id=${cache.hauptbild}`;
          }

          if (Array.isArray(cache.galerie)) {
            mapped.galerie = cache.galerie
              .slice(0, 25)
              .map((id) => `${origin}/api/media?id=${id}`);
          }

          if (cache.grundriss) {
            mapped.grundriss = `${origin}/api/media?id=${cache.grundriss}`;
          }
        }

        // ------------------------------
        // Features verknüpfen
        // ------------------------------
        const featureIds = (mapped.featureSlugs || [])
          .map((slug) => featureMap[slug])
          .filter(Boolean);

        delete mapped.featureSlugs;
        mapped.features = featureIds;

        // ------------------------------
        // Webflow CREATE
        // ------------------------------
        const body = {
          items: [{ fieldData: mapped }],
        };

        const wfRes = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION}/items`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${WEBFLOW_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        const wfJson = await wfRes.json();
        if (!wfRes.ok) throw wfJson;

        results.push({
          id: mapped["fahrzeug-id"],
          name: mapped.name,
          status: "created",
        });
      } catch (err) {
        results.push({
          id: ad?.id || null,
          error: err?.message || err,
        });
      }
    }

    // --------------------------------------------
    // Ergebnis
    // --------------------------------------------
    return res.status(200).json({
      ok: true,
      totalAds: ads.length,
      limit,
      offset,
      processed: results.length,
      results,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e });
  }
}
