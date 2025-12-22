// pages/api/delta-sync.js
import mapVehicle from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const OFFSET_KEY = "delta-sync-offset";

let featureMapCache = null;
let bettartenMapCache = null;

/* ----------------------------------------------------
   REDIS (Upstash REST)
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
   MAP LOADER (slug → id)
---------------------------------------------------- */
async function loadSlugMap(token, collectionId) {
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

  return map;
}

async function getFeatureMap(token, collectionId) {
  if (!featureMapCache) {
    featureMapCache = await loadSlugMap(token, collectionId);
  }
  return featureMapCache;
}

async function getBettartenMap(token, collectionId) {
  if (!bettartenMapCache) {
    bettartenMapCache = await loadSlugMap(token, collectionId);
  }
  return bettartenMapCache;
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

    if (!WEBFLOW_BETTARTEN_COLLECTION) {
      throw new Error("Missing env WEBFLOW_BETTARTEN_COLLECTION");
    }

    const limit = Math.min(parseInt(req.query.limit || "25", 10), 25);
    const dryRun = req.query.dry === "1";

    let offset = (await redisGet(OFFSET_KEY)) || 0;

    /* ---------------- SYSCARA ---------------- */
    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    const sysRes = await fetch(
      "https://api.syscara.com/sale/ads/",
      { headers: { Authorization: auth } }
    );
    if (!sysRes.ok) throw await sysRes.text();

    const sysAdsAll = Object.values(await sysRes.json());

    // ✅ nur PLZ 24783
    const sysAds = sysAdsAll.filter(
      (ad) => ad?.store?.zipcode === "24783"
    );

    const batch = sysAds.slice(offset, offset + limit);
    const sysMap = new Map(sysAds.map((a) => [String(a.id), a]));

    /* ---------------- WEBFLOW ITEMS ---------------- */
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

    /* ---------------- LOOKUP MAPS ---------------- */
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

    /* ---------------- CREATE / UPDATE ---------------- */
    for (const ad of batch) {
      const mapped = mapVehicle(ad);

      // FEATURES → IDs
      mapped.features = (mapped.featureSlugs || [])
        .map((s) => featureMap[s])
        .filter(Boolean);

      // BETTARTEN → IDs
      mapped.bettarten = (mapped.bettartenSlugs || [])
        .map((s) => bettartenMap[s])
        .filter(Boolean);

      delete mapped.featureSlugs;
      delete mapped.bettartenSlugs;

      mapped["sync-hash"] = createHash(mapped);

      const existing = wfMap.get(mapped["fahrzeug-id"]);

      if (existing) {
        if (existing.fieldData?.["sync-hash"] === mapped["sync-hash"]) {
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
        }
        updated++;
      } else {
        if (!dryRun) {
          await wf(
            `${WEBFLOW_BASE}/collections/${WEBFLOW_COLLECTION}/items`,
            "POST",
            WEBFLOW_TOKEN,
            {
              isDraft: false,
              isArchived: false,
              fieldData: mapped,
            }
          );
        }
        created++;
      }
    }

    /* ---------------- DELETE ---------------- */
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

    const nextOffset =
      offset + limit >= sysAds.length ? 0 : offset + limit;
    if (!dryRun) await redisSet(OFFSET_KEY, nextOffset);

    res.json({
      ok: true,
      created,
      updated,
      skipped,
      deleted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}
