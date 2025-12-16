// pages/api/sync.js
import { mapVehicle } from "../libs/map.js";

let featureMapCache = null;

// ----------------------------------------------------
// Webflow Helper
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
// Feature Map laden (Slug -> ID)
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
// Helper: Origin sauber bauen (Vercel / Proxies)
// ----------------------------------------------------
function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
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

    if (
      !WEBFLOW_TOKEN ||
      !WEBFLOW_COLLECTION ||
      !WEBFLOW_FEATURES_COLLECTION ||
      !SYS_API_USER ||
      !SYS_API_PASS
    ) {
      return res.status(500).json({ error: "Missing ENV vars" });
    }

    // 🔹 Testfahrzeug
    const sysId = 135965;
    const sysUrl = `https://api.syscara.com/sale/ads/${sysId}`;

    const sysRes = await fetch(sysUrl, {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64"),
        "Content-Type": "application/json",
        accept: "application/json",
      },
    });

    // ✅ WICHTIG: Wenn Syscara nicht OK liefert, sofort abbrechen
    if (!sysRes.ok) {
      const text = await sysRes.text();
      console.error("Syscara error:", sysRes.status, text);
      return res.status(500).json({
        error: "Syscara Request failed",
        status: sysRes.status,
        details: text,
      });
    }

    const ad = await sysRes.json();

    // 🔹 Mapping
    const mapped = mapVehicle(ad);

    // ------------------------------------------------
    // 🖼️ BILDER AUS media-cache ERGÄNZEN (hauptbild/galerie/grundriss)
    // ------------------------------------------------
    const origin = getOrigin(req);

    if (mapped["media-cache"]) {
      let mediaCache = null;
      try {
        mediaCache = JSON.parse(mapped["media-cache"]);
      } catch (e) {
        console.error("media-cache JSON parse failed:", mapped["media-cache"]);
      }

      if (mediaCache?.hauptbild) {
        mapped.hauptbild = `${origin}/api/media?id=${mediaCache.hauptbild}`;
      }

      if (Array.isArray(mediaCache?.galerie) && mediaCache.galerie.length) {
        mapped.galerie = mediaCache.galerie
          .slice(0, 25)
          .map((id) => `${origin}/api/media?id=${id}`);
      }

      if (mediaCache?.grundriss) {
        mapped.grundriss = `${origin}/api/media?id=${mediaCache.grundriss}`;
      }
    }

    // ------------------------------------------------
    // 🔹 Feature-Matching (Slug -> Item-ID)
    // ------------------------------------------------
    const featureMap = await getFeatureMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION
    );

    const featureIds = (mapped.featureSlugs || [])
      .map((slug) => featureMap[slug])
      .filter(Boolean);

    delete mapped.featureSlugs;
    mapped.features = featureIds;

    // ------------------------------------------------
    // 🔹 Webflow Create
    // ------------------------------------------------
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
          accept: "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const wfJson = await wfRes.json();
    if (!wfRes.ok) {
      console.error("Webflow Error:", wfJson);
      return res.status(500).json({ error: "Webflow API error", details: wfJson });
    }

    return res.status(200).json({
      ok: true,
      syscaraId: sysId,
      vehicle: mapped.name,
      featuresLinked: featureIds.length,
      images: {
        hauptbild: !!mapped.hauptbild,
        galerie: mapped.galerie?.length || 0,
        grundriss: !!mapped.grundriss,
      },
      debug: {
        origin,
        hasMediaCache: !!mapped["media-cache"],
      },
      webflowItem: wfJson,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || err });
  }
}

