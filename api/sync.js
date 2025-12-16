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

    // --------------------------------------------------
    // 1) Testfahrzeug laden
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
    // 2) Mapping
    // --------------------------------------------------
    const mapped = mapVehicle(ad);
    console.log("✅ Mapped Vehicle:", mapped);

    // --------------------------------------------------
    // 3) Media-Cache auslesen
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

    // Hauptbild
    const hauptbildUrl =
      mediaCache?.hauptbild != null
        ? `${origin}/api/media?id=${mediaCache.hauptbild}`
        : null;

    // Grundriss
    const grundrissUrl =
      mediaCache?.grundriss != null
        ? `${origin}/api/media?id=${mediaCache.grundriss}`
        : null;

    // Galerie (max. 25 Bilder)
    const galerieUrls = Array.isArray(mediaCache?.galerie)
      ? mediaCache.galerie
          .slice(0, 25)
          .map((id) => `${origin}/api/media?id=${id}`)
      : [];

    console.log("🖼️ Hauptbild:", hauptbildUrl);
    console.log("📐 Grundriss:", grundrissUrl);
    console.log("🖼️ Galerie:", galerieUrls.length);

    // --------------------------------------------------
    // 4) FieldData bauen
    // --------------------------------------------------
    const fieldData = {
      ...mapped,
      ...(hauptbildUrl ? { hauptbild: hauptbildUrl } : {}),
      ...(grundrissUrl ? { grundriss: grundrissUrl } : {}),
      ...(galerieUrls.length > 0 ? { galerie: galerieUrls } : {}),
    };

    const body = {
      items: [
        {
          fieldData,
        },
      ],
    };

    // --------------------------------------------------
    // 5) Webflow Request
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
    // 6) Erfolg
    // --------------------------------------------------
    return res.status(200).json({
      ok: true,
      syscaraId: sysId,
      images: {
        hauptbild: hauptbildUrl,
        grundriss: grundrissUrl,
        galerieCount: galerieUrls.length,
      },
      webflowResponse: wfJson,
    });
  } catch (err) {
    console.error("Unhandled Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
