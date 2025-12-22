// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const OFFSET_KEY = "delta-sync-offset";

let featureMapCache = null;
let bedTypeMapCache = null;

/* ----------------------------------------------------
   REDIS (Upstash REST – ohne SDK)
---------------------------------------------------- */
async function redisGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
    },
  });

  const json = await res.json();
  return json.result === null ? null : Number(json.result);
}

async function redisSet(key, value) {
  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: String(value),
  });
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

  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text || null;
  }

  if (!res.ok) throw json;
  return json;
}

/* ----------------------------------------------------
   UNPUBLISH LIVE ITEM
---------------------------------------------------- */
async function unpublishLiveItem(collectionId, itemId, token) {
  return wf(
    `${WEBFLOW_BASE}/collections/${collectionId}/items/${itemId}/live`,
    "DELETE",
    token
  );
}

/* ----------------------------------------------------
   PUBLISH (STAGING)
   (Webflow v2 publish endpoint auf Collection-Ebene)
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
   ORIGIN (Media Proxy)
---------------------------------------------------- */
function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/* ----------------------------------------------------
   GENERIC MAP (slug → ID) für eine Collection
---------------------------------------------------- */
async function getSlugToIdMap(token, collectionId, cacheRef) {
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
      WEBFLOW_BEDTYPES_COLLECTION, // ✅ NEU
      SYS_API_USER,
      SYS_API_PASS,
    } = process.env;

    if (
      !WEBFLOW_TOKEN ||
      !WEBFLOW_COLLECTION ||
      !WEBFLOW_FEATURES_COLLECTION ||
      !WEBFLOW_BEDTYPES_COLLECTION ||
      !SYS_API_USER ||
      !SYS_API_PASS
    ) {
      return res.status(500).json({
        error:
          "Missing ENV vars (WEBFLOW_TOKEN, WEBFLOW_COLLECTION, WEBFLOW_FEATURES_COLLECTION, WEBFLOW_BEDTYPES_COLLECTION, SYS_API_USER, SYS_API_PASS)",
      });
    }

    const limit = Math.min(parseInt(req.query.limit || "25", 10), 25);
    const dryRun = req.query.dry === "1";
    const origin = getOrigin(req);

    /* ----------------------------------------------
       OFFSET
    ---------------------------------------------- */
    let offset = (await redisGet(OFFSET_KEY)) || 0;

    /* ----------------------------------------------
       SYSCARA – LOAD + FILTER (PLZ 24783)
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
    const sysAds = sysAdsAll.filter((ad) => ad?.store?.zipcode === "24783");

    const batch = sysAds.slice(offset, offset + limit);
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
       FEATURE MAP + BEDTYPE MAP
    ---------------------------------------------- */
    const featureMap = await getSlugToIdMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION,
      { get value() { return featureMapCache; }, set value(v) { featureMapCache = v; } }
    );

    const bedTypeMap = await getSlugToIdMap(
      WEBFLOW_TOKEN,
      WEBFLOW_BEDTYPES_COLLECTION,
      { get value() { return bedTypeMapCache; }, set value(v) { bedTypeMapCache = v; } }
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

        // Kilometer Fix
        const km = parseInt(mapped.kilometer, 10);
        mapped.kilometer = Number.isFinite(km) ? String(km) : "0";

        // MEDIA
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

        // FEATURES (Multi-Reference)
        const featureIds = (mapped.featureSlugs || [])
          .map((s) => featureMap[s])
          .filter(Boolean);
        delete mapped.featureSlugs;
        mapped.features = featureIds;

        // BETTARTEN (Multi-Reference) – robust: '-' oder '_'
        const bedTypeIds = (mapped.bettartenSlugs || [])
          .map((s) => {
            // zuerst "kingsize-bed"
            if (bedTypeMap[s]) return bedTypeMap[s];
            // fallback "kingsize_bed"
            const underscore = s.replace(/-/g, "_");
            if (bedTypeMap[underscore]) return bedTypeMap[underscore];
            return null;
          })
          .filter(Boolean);

        delete mapped.bettartenSlugs;

        // ✅ Feldname in Webflow: "bettarten"
        mapped.bettarten = bedTypeIds;

        // Change detection
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

            await publishItem(WEBFLOW_COLLECTION, WEBFLOW_TOKEN, createdItem.id);
          }

          created++;
        }
      } catch (e) {
        errors.push({
          syscaraId: ad?.id || null,
          error: typeof e === "string" ? e : JSON.stringify(e),
        });
      }
    }

    /* ----------------------------------------------
       DELETE (nicht mehr PLZ 24783 oder entfernt)
    ---------------------------------------------- */
    for (const [fid, item] of wfMap.entries()) {
      if (!sysMap.has(fid)) {
        if (!dryRun) {
          await unpublishLiveItem(WEBFLOW_COLLECTION, item.id, WEBFLOW_TOKEN);
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
       OFFSET UPDATE
    ---------------------------------------------- */
    const nextOffset = offset + limit >= sysAds.length ? 0 : offset + limit;

    if (!dryRun) {
      await redisSet(OFFSET_KEY, nextOffset);
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      limit,
      offset,
      nextOffset,
      totals: {
        syscaraFiltered: sysAds.length,
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
    return res.status(500).json({
      error: typeof err === "string" ? err : JSON.stringify(err),
    });
  }
}
