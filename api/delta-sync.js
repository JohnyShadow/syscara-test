// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const OFFSET_KEY = "delta-sync-offset";
let featureMapCache = null;

/* ----------------------------------------------------
   REDIS (Upstash REST – KEIN SDK!)
---------------------------------------------------- */
async function redisGet(key) {
  const res = await fetch(
    `${process.env.KV_REST_API_URL}/get/${key}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      },
    }
  );
  const json = await res.json();
  return json.result;
}

async function redisSet(key, value) {
  await fetch(
    `${process.env.KV_REST_API_URL}/set/${key}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    }
  );
}

/* ----------------------------------------------------
   HASH
---------------------------------------------------- */
function createHash(obj) {
  return crypto.createHash("sha1").update(JSON.stringify(obj)).digest("hex");
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
   LIVE UNPUBLISH
---------------------------------------------------- */
async function unpublishLiveItem(collectionId, itemId, token) {
  return wf(
    `${WEBFLOW_BASE}/collections/${collectionId}/items/${itemId}/live`,
    "DELETE",
    token
  );
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

  featureMapCache = map;
  return map;
}

/* ----------------------------------------------------
   PUBLISH (STAGING)
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
    const dryRun = req.query.dry === "1";
    const origin = getOrigin(req);

    /* ----------------------------------------------
       OFFSET AUS REDIS
    ---------------------------------------------- */
    let offset = (await redisGet(OFFSET_KEY)) || 0;

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

    const sysAds = Object.values(await sysRes.json());
    const batch = sysAds.slice(offset, offset + limit);
    const sysMap = new Map(sysAds.map((a) => [String(a.id), a]));

    /* ----------------------------------------------
       WEBFLOW ITEMS
    ---------------------------------------------- */
    const wfMap = new Map();
    let wfOffset = 0;

    while (true) {
      const res = await wf(
        `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items?limit=100&offset=${wfOffset}`,
        "GET",
        WEBFLOW_TOKEN
      );
      for (const item of res.items || []) {
        const fid = item.fieldData?.["fahrzeug-id"];
        if (fid) wfMap.set(String(fid), item);
      }
      if (!res.items || res.items.length < 100) break;
      wfOffset += 100;
    }

    const featureMap = await getFeatureMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION
    );

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

        // 🚗 Neuwagen → Kilometer = "0" (STRING!)
        const hasErstzulassung =
          mapped.erstzulassung &&
          String(mapped.erstzulassung).trim() !== "";

        const kmParsed = parseInt(mapped.kilometer, 10);
        if (!hasErstzulassung && !Number.isFinite(kmParsed)) {
          mapped.kilometer = "0";
        } else if (Number.isFinite(kmParsed)) {
          mapped.kilometer = String(kmParsed);
        }

        // 🖼️ MEDIA
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
          .map((s) => featureMap[s])
          .filter(Boolean);

        delete mapped.featureSlugs;
        mapped.features = featureIds;

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
            await publishItem(WEBFLOW_COLLECTION, WEBFLOW_TOKEN, existing.id);
          }

          updated++;
        } else {
          if (!dryRun) {
            const createdItem = await wf(
              `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items`,
              "POST",
              WEBFLOW_TOKEN,
              { isDraft: false, isArchived: false, fieldData: mapped }
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
        errors.push({ syscaraId: ad?.id || null, error: e });
      }
    }

    /* ----------------------------------------------
       DELETE (Live → Delete)
    ---------------------------------------------- */
    for (const [fid, item] of wfMap.entries()) {
      if (!sysMap.has(fid)) {
        if (!dryRun) {
          await unpublishLiveItem(
            WEBFLOW_COLLECTION,
            item.id,
            WEBFLOW_TOKEN
          );
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
       OFFSET SPEICHERN
    ---------------------------------------------- */
    const nextOffset =
      offset + limit >= sysAds.length ? 0 : offset + limit;

    if (!dryRun) {
      await redisSet(OFFSET_KEY, nextOffset);
    }

    return res.status(200).json({
      ok: true,
      limit,
      offset,
      nextOffset,
      totals: {
        syscara: sysAds.length,
        webflow: wfMap.size,
      },
      created,
      updated,
      skipped,
      deleted,
      errors,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err });
  }
}

