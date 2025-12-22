// pages/api/delta-sync.js
import { mapVehicle } from "../libs/map.js";
import crypto from "crypto";

const WEBFLOW_BASE = "https://api.webflow.com/v2";
const OFFSET_KEY = "delta-sync-offset";

let featureMapCache = null;
let bettartenMapCache = null;

/* ---------------- REDIS ---------------- */
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

/* ---------------- HASH ---------------- */
function createHash(obj) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(obj))
    .digest("hex");
}

/* ---------------- WEBFLOW ---------------- */
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

/* ---------------- MAP LOADER ---------------- */
async function loadSlugMap(token, collectionId) {
  const map = {};
  let offset = 0;

  while (true) {
    const r = await wf(
      `${WEBFLOW_BASE}/collections/${collectionId}/items?limit=100&offset=${offset}`,
      "GET",
      token
    );

    for (const item of r.items || []) {
      const slug = item.fieldData?.slug;
      if (slug) map[slug] = item.id;
    }

    if (!r.items || r.items.length < 100) break;
    offset += 100;
  }

  return map;
}

async function getFeatureMap(token, cid) {
  if (!featureMapCache)
    featureMapCache = await loadSlugMap(token, cid);
  return featureMapCache;
}

async function getBettartenMap(token, cid) {
  if (!bettartenMapCache)
    bettartenMapCache = await loadSlugMap(token, cid);
  return bettartenMapCache;
}

/* ---------------- HANDLER ---------------- */
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

    const limit = Math.min(Number(req.query.limit || 25), 25);
    const dryRun = req.query.dry === "1";

    let offset = (await redisGet(OFFSET_KEY)) || 0;

    const auth =
      "Basic " +
      Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    const sysRes = await fetch(
      "https://api.syscara.com/sale/ads/",
      { headers: { Authorization: auth } }
    );
    if (!sysRes.ok) throw await sysRes.text();

    const sysAdsAll = Object.values(await sysRes.json());
    const sysAds = sysAdsAll.filter(
      (a) => a?.store?.zipcode === "24783"
    );

    const batch = sysAds.slice(offset, offset + limit);
    const sysMap = new Map(sysAds.map((a) => [String(a.id), a]));

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

    let created = 0,
      updated = 0,
      skipped = 0,
      deleted = 0;

    for (const ad of batch) {
      const mapped = mapVehicle(ad);

      mapped.features = (mapped.featureSlugs || [])
        .map((s) => featureMap[s])
        .filter(Boolean);

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
    }

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
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

