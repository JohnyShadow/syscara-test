// pages/api/sync.js
import { mapVehicle } from "../libs/map.js";

export default async function handler(req, res) {
  try {
    const {
      WEBFLOW_TOKEN,
      WEBFLOW_COLLECTION,
      SYS_API_USER,
      SYS_API_PASS,
    } = process.env;

    if (!WEBFLOW_TOKEN || !WEBFLOW_COLLECTION || !SYS_API_USER || !SYS_API_PASS) {
      return res.status(500).json({
        error:
          "Fehlende ENV Variablen (WEBFLOW_TOKEN, WEBFLOW_COLLECTION, SYS_API_USER, SYS_API_PASS)",
      });
    }

    // --------------------------------------------------
    // 1️⃣ EIN Fahrzeug zum Test laden
    // --------------------------------------------------
    const sysId = 135965;
    const sysUrl = `https://api.syscara.com/sale/ads/${sysId}`;

    const sysResponse = await fetch(sysUrl, {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64"),
        "Content-Type": "application/json",
      },
    });

    if (!sysResponse.ok) {
      const text = await sysResponse.text();
      return res.status(500).json({
        error: "Syscara Request fehlgeschlagen",
        details: text,
      });
    }

    const ad = await sysResponse.json();

    // --------------------------------------------------
    // 2️⃣ Mapping → Webflow Felder
    // --------------------------------------------------
    const mapped = mapVehicle(ad);
    console.log("✅ Mapped Vehicle:", mapped);

    // --------------------------------------------------
    // 3️⃣ Media-Cache aus Mapping lesen
    // --------------------------------------------------
    let mediaCache = null;

    try {
      mediaCache = mapped["media-cache"]
        ? JSON.parse(mapped["media-cache"])
        : null;
    } catch {
      mediaCache = null;
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    // --------------------------------------------------
    // 4️⃣ Hauptbild (einzeln)
    // --------------------------------------------------
    const hauptbildId = mediaCache?.hauptbild ?? null;
    const hauptbildUrl = hauptbildId
      ? `${origin}/api/media?id=${hauptbildId}`
      : null;

    // --------------------------------------------------
    // 5️⃣ Galerie (max. 25 Bilder, Reihenfolge behalten)
    // --------------------------------------------------
    let galerieUrls = [];

    if (Array.isArray(mediaCache?.galerie)) {
      galerieUrls = mediaCache.galerie
        .slice(0, 25)
        .map((id) => `${origin}/api/media?id=${id}`);
    }

    console.log("🖼️ Hauptbild URL:", hauptbildUrl);
    console.log("🖼️ Galerie URLs:", galerieUrls.length);

    // --------------------------------------------------
    // 6️⃣ FieldData für Webflow bauen
    // --------------------------------------------------
    const fieldData = {
      ...mapped,
      ...(hauptbildUrl ? { hauptbild: hauptbildUrl } : {}),
      ...(galerieUrls.length ? { galerie: galerieUrls } : {}),
    };

    // media-cache NICHT mehr an Webflow senden
    delete fieldData["media-cache"];

    const body = {
      items: [
        {
          fieldData,
        },
      ],
    };

    console.log("➡️ Body an Webflow:", JSON.stringify(body, null, 2));

    // --------------------------------------------------
    // 7️⃣ Webflow API Call
    // --------------------------------------------------
    const wfUrl = `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION}/items`;

    const wfResponse = await fetch(wfUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WEBFLOW_TOKEN}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const wfJson = await wfResponse.json();

    if (!wfResponse.ok) {
      console.error("Webflow Error:", wfJson);
      return res.status(500).json({
        error: "Webflow API error",
        details: wfJson,
      });
    }

    // --------------------------------------------------
    // 8️⃣ Erfolg
    // --------------------------------------------------
    return res.status(200).json({
      ok: true,
      syscaraId: sysId,
      hauptbildUrl,
      galerieCount: galerieUrls.length,
      webflowResponse: wfJson,
    });
  } catch (err) {
    console.error("Unhandled Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

