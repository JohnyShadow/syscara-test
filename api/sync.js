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

    if (
      !WEBFLOW_TOKEN ||
      !WEBFLOW_COLLECTION ||
      !SYS_API_USER ||
      !SYS_API_PASS
    ) {
      return res.status(500).json({
        error:
          "Fehlende ENV Variablen (WEBFLOW_TOKEN, WEBFLOW_COLLECTION, SYS_API_USER, SYS_API_PASS)",
      });
    }

    // 🚗 1. EIN Fahrzeug zum Test laden
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
      console.error("Syscara error:", text);
      return res.status(500).json({
        error: "Syscara Request fehlgeschlagen",
        details: text,
      });
    }

    const ad = await sysResponse.json();

    // 🧩 2. Map Fahrzeugdaten → Webflow Felder
    const mapped = mapVehicle(ad);
    console.log("✅ Mapped Vehicle:", mapped);

    // 🔍 3. media-cache auswerten → Hauptbild-ID nehmen
    let mediaCache = null;
    if (mapped["media-cache"]) {
      try {
        mediaCache = JSON.parse(mapped["media-cache"]);
      } catch (e) {
        console.warn("Konnte media-cache nicht parsen:", e);
      }
    }

    const hauptbildId = mediaCache?.hauptbild || null;

    // 🌐 4. Öffentliche Proxy-URL für das Hauptbild bauen
    //    → Webflow ruft später diese URL auf und bekommt das Bild
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const origin = `${proto}://${host}`;

    const hauptbildUrl = hauptbildId
      ? `${origin}/api/media?id=${encodeURIComponent(hauptbildId)}`
      : null;

    console.log("➡️ Proxy URL Hauptbild:", hauptbildUrl);

    // 📝 5. Body für Webflow: alle Felder + optional hauptbild
    const fieldData = {
      ...mapped,
      ...(hauptbildUrl ? { hauptbild: hauptbildUrl } : {}),
    };

    const body = {
      items: [
        {
          fieldData,
        },
      ],
    };

    console.log("➡️ Body an Webflow:", JSON.stringify(body, null, 2));

    // 🚀 6. Request an Webflow (CMS API v2)
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

    // 🎉 7. Erfolg
    return res.status(200).json({
      ok: true,
      syscaraId: sysId,
      mapped,
      hauptbildUrl,
      webflowResponse: wfJson,
    });
  } catch (err) {
    console.error("Unhandled Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

