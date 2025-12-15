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

    // 🧩 2. Map Fahrzeugdaten → Webflow
    const mapped = mapVehicle(ad);

    console.log("✅ Mapped Vehicle:", mapped);

    // 🖼️ 3. HAUPTBILD PROXY vorbereiten
    let mediaCache = mapped["media-cache"]
      ? JSON.parse(mapped["media-cache"])
      : null;

    let hauptbildId = mediaCache?.hauptbild || null;

    // Proxy-URL für Webflow (damit Bild downloadbar ist)
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const hauptbildUrl = hauptbildId
      ? `${origin}/api/media?id=${hauptbildId}`
      : null;

    console.log("➡️ Proxy URL Hauptbild:", hauptbildUrl);

    // 📝 4. Body für Webflow → mapped + Hauptbild
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

    // 🌐 5. Webflow Request
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

    // 🎉 6. Erfolg
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

