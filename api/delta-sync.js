// pages/api/delta-sync.js
import mapVehicle from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const OFFSET_KEY = "delta-sync-offset";

let featureMapCache = null;
let bettartenMapCache = null;

/* ----------------------------------------------------
   REDIS (Upstash REST – ohne SDK)
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
  return json.result === null ? null : Number(json.result);
}

async function redisSet(key, value) {
  await fetch(
    `${process.env.KV_REST_API_URL}/set/${key}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: String(value),
    }
  );
}

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
   FEATURE MAP (slug → ID)
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
   BETTARTEN MAP (slug → ID)
---------------------------------------------------- */
async function getBettartenMap(token, collectionId) {
  if (bettartenMapCache) return bettartenMapCache;

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

  bettartenMapCache = map;
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
      WEBFLOW_BETTARTEN_COLLECTION,
      SYS_API_USER,
      SYS_API_PASS,
    } = process.env;

    // SICHERHEITS-LIMIT FÜR TEST: Nur 2 Fahrzeuge
    const limit = 2;
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
    const sysAds = sysAdsAll.filter(
      (ad) => ad?.store?.zipcode === "24783"
    );

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

    const featureMap = await getFeatureMap(
      WEBFLOW_TOKEN,
      WEBFLOW_FEATURES_COLLECTION
    );

    const bettartenMap = await getBettartenMap(
      WEBFLOW_TOKEN,
      WEBFLOW_BETTARTEN_COLLECTION
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

          if (cache.hauptbild)
            mapped.hauptbild = `${origin}/api/media?id=${cache.hauptbild}`;

          if (Array.isArray(cache.galerie)) {
            mapped.galerie = cache.galerie
              .slice(0, 25)
              .map((id) => `${origin}/api/media?id=${id}`);
          }

          if (cache.grundriss)
            mapped.grundriss = `${origin}/api/media?id=${cache.grundriss}`;
        }

        // FEATURES (unverändert)
        const featureIds = (mapped.featureSlugs || [])
          .map((s) => featureMap[s])
          .filter(Boolean);

        delete mapped.featureSlugs;
        mapped.features = featureIds;

        // BETTKATEGORIEN (NEU, MINIMAL)
        const bettartenIds = (mapped.bettartenSlugs || [])
          .map((s) => bettartenMap[s])
          .filter(Boolean);

        delete mapped.bettartenSlugs;

        if (bettartenIds.length > 0) {
          mapped.bettkategorien = bettartenIds; // ✅ API FIELD NAME
        }

        // 🔐 Change Detection (Ursprüngliches Verhalten wiederhergestellt)
        const hash = createHash(mapped);
        mapped["sync-hash"] = hash;

        const existing = wfMap.get(mapped["fahrzeug-id"]);

        if (existing) {
          const existingHash = existing.fieldData?.["sync-hash"];
          if (existingHash === hash) {
            skipped++;
            continue;
          } else {
            console.log(`HASH MISMATCH for ${mapped["fahrzeug-id"]}:`);
            console.log(`  Calculated: ${hash}`);
            console.log(`  In Webflow: ${existingHash}`);
            // Optional: Zeige Unterschiede in den Daten (nur im Log)
            // console.log(`  Data: ${JSON.stringify(mapped)}`);
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
        } else {
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
          error: String(e),
        });
      }
    }

    /* ----------------------------------------------
       DELETE (nicht mehr PLZ 24783 oder entfernt)
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
       OFFSET UPDATE
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
    return res.status(500).json({ error: String(err) });
  }
}
