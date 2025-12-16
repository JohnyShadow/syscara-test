// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
let featureMapCache = null;

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
  if (!res.ok) throw json || await res.text();
  return json;
}

/* ----------------------------------------------------
   ORIGIN (für Media Proxy)
---------------------------------------------------- */
function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/* ----------------------------------------------------
   FEATURE MAP (slug → id)
---------------------------------------------------- */
async function getFeatureMap(token, collectionId) {
  if (featureMapCache) return featureMapCache;

  const map = {};
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await wf(
      `${WEBFLOW_BASE}/collections/${collectionId}/items?limit=${limit}&offset=${offset}`,
      "GET",
      token
    );

    for (const item of res.items || []) {
      const slug = item.fieldData?.slug;
      if (slug) map[slug] = item.id;
    }

    if (!res.items || res.items.length < limit) break;
    offset += limit;
  }

  featureMapCache = map;
  return map;
}

/* ----------------------------------------------------
   PUBLISH (V2, STAGING)
---------------------------------------------------- */
async function publishItem(collectionId, token, itemId) {
  return wf(
    `${WEBFLOW_BASE}/collections/${collectionId}/items/publish`,
    "POST",
    token,
    { itemIds: [itemId] }
  );
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
      SYS_API_USER,
      SYS_API_PASS,
    } = process.env;

    const limit = Math.min(parseInt(req.query.limit || "25", 10), 25);
    const offset = parseInt(req.query.offset || "0", 10);
    const dryRun = req.query.dry === "1";

    /* ----------------------------------------------
       SYSCARA FETCH
    ---------------------------------------------- */
    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

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

    /* ----------------------------------------------
       WEBFLOW ITEMS (paginiert!)
    ---------------------------------------------- */
    const wfMap = new Map();
    let wfOffset = 0;

    while (true) {
      const wfRes = await wf(
        `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items?limit=100&offset=${wfOffset}`,
        "GET",
        WEBFLOW_TOKEN
      );

      for (const item of wfRes.items || []) {
        const fid = item.fieldData?.["fahrzeug-id"];
        if (fid) wfMap.set(String(fid), item);
      }

      if (!wfRes.items || wfRes.items.length < 100) break;
      wfOffset += 100;
    }

    /* ----------------------------------------------
       FEATURE MAP
    ---------------------------------------------- */
    const featureMap = await getFeatureMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION
    );

    const origin = getOrigin(req);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deleted = 0;
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
        const featureIds = (mapped.featureSlugs || [])
          .map((slug) => featureMap[slug])
          .filter(Boolean);

        delete mapped.featureSlugs;
        mapped.features = featureIds;

        // HASH
        const hash = createHash(mapped);
        mapped["sync-hash"] = hash;

        const existing = wfMap.get(mapped["fahrzeug-id"]);

        /* ---------- UPDATE ---------- */
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
              {
                isDraft: false,
                isArchived: false,
                fieldData: mapped,
              }
            );

            await publishItem(
              WEBFLOW_COLLECTION,
              WEBFLOW_TOKEN,
              existing.id
            );
          }

          updated++;
        }

        /* ---------- CREATE ---------- */
        else {
          if (!dryRun) {
            const createdItem = await wf(
              `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items`,
              "POST",
              WEBFLOW_TOKEN,
              {
                isDraft: false,
                isArchived: false,
                fieldData: mapped,
              }
            );

            await publishItem(
              WEBFLOW_COLLECTION,
              WEBFLOW_TOKEN,
              createdItem.id
            );
          }

          created++;
        }
      } catch (e) {
        errors.push({
          syscaraId: ad?.id || null,
          error: e,
        });
      }
    }

    /* ----------------------------------------------
       DELETE
    ---------------------------------------------- */
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

    /* ----------------------------------------------
       RESULT
    ---------------------------------------------- */
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
      errors,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err?.message || err,
    });
  }
}
