// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const OFFSET_KEY = "delta-sync-offset";

let featureMapCache = null;
let bedTypeMapCache = null;

/* ----------------------------------------------------
   HASH
---------------------------------------------------- */
function createHash(obj) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(obj))
    .digest("hex");
}

/* ----------------------------------------------------
   WEBFLOW REQUEST
---------------------------------------------------- */
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

/* ----------------------------------------------------
   ORIGIN
---------------------------------------------------- */
function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/* ----------------------------------------------------
   GENERIC MAP (slug → ID)
---------------------------------------------------- */
async function loadSlugMap(token, collectionId, cacheRef) {
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

/* ----------------------------------------------------
   API HANDLER
---------------------------------------------------- */
export default async function handler(req, res) {
  try {
    const {
      WEBFLOW_TOKEN,
      WEBFLOW_COLLECTION,
      WEBFLOW_FEATURES_COLLECTION,
      WEBFLOW_BEDTYPES_COLLECTION,
      SYS_API_USER,
      SYS_API_PASS,
    } = process.env;

    const limit = Math.min(parseInt(req.query.limit || "25", 10), 25);
    const dryRun = req.query.dry === "1";
    const origin = getOrigin(req);

    /* ----------------------------------------------
       SYSCARA
    ---------------------------------------------- */
    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    const sysRes = await fetch("https://api.syscara.com/sale/ads/", {
      headers: { Authorization: auth },
    });
    if (!sysRes.ok) throw await sysRes.text();

    const sysAdsAll = Object.values(await sysRes.json());

    // ✅ NUR OSTERRÖNFELD
    const sysAds = sysAdsAll.filter(
      (ad) => ad?.store?.zipcode === "24783"
    );

    const batch = sysAds.slice(0, limit);
    const sysMap = new Map(sysAds.map((a) => [String(a.id), a]));

    /* ----------------------------------------------
       WEBFLOW ITEMS
    ---------------------------------------------- */
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

    /* ----------------------------------------------
       MAPS
    ---------------------------------------------- */
    const featureMap = await loadSlugMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION,
      { value: featureMapCache }
    );

    const bedTypeMap = await loadSlugMap(
      WEBFLOW_TOKEN,
      WEBFLOW_BEDTYPES_COLLECTION,
      { value: bedTypeMapCache }
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    /* ----------------------------------------------
       CREATE / UPDATE
    ---------------------------------------------- */
    for (const ad of batch) {
      try {
        const mapped = mapVehicle(ad);

        // MEDIA
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

        // FEATURES
        mapped.features = (mapped.featureSlugs || [])
          .map((s) => featureMap[s])
          .filter(Boolean);
        delete mapped.featureSlugs;

        // BETTARTEN ✅
        mapped.bettarten = (mapped.bettartenSlugs || [])
          .map((s) => bedTypeMap[s])
          .filter(Boolean);
        delete mapped.bettartenSlugs;

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
              { isDraft: false, isArchived: false, fieldData: mapped }
            );
          }

          updated++;
        } else {
          if (!dryRun) {
            await wf(
              `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items`,
              "POST",
              WEBFLOW_TOKEN,
              { isDraft: false, isArchived: false, fieldData: mapped }
            );
          }
          created++;
        }
      } catch (e) {
        errors.push({ syscaraId: ad?.id, error: String(e) });
      }
    }

    return res.status(200).json({
      ok: true,
      created,
      updated,
      skipped,
      errors,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
