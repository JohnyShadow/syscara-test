// api/test-map.js

import { mapAdToWebflow } from "../libs/map.js";

export default async function handler(req, res) {
  try {
    // Syscara Login über BASIC AUTH
    const auth = Buffer.from(
      `${process.env.SYS_API_USER}:${process.env.SYS_API_PASS}`
    ).toString("base64");

    // 1. Ad-Liste holen
    const response = await fetch("https://api.syscara.com/sale/ads/", {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      return res
        .status(500)
        .json({ error: "Syscara fetch error", status: response.status });
    }

    const data = await response.json();

    const firstKey = Object.keys(data)[0];
    const firstAd = data[firstKey];

    if (!firstAd) {
      return res.status(404).json({ error: "No ads found" });
    }

    // 2. Mapping durchführen
    const mapped = mapAdToWebflow(firstAd);

    // 3. Ergebnis zurückgeben
    res.status(200).json({
      originalId: firstAd.id || firstKey,
      mapped,
    });
  } catch (err) {
    console.error("Mapping test error:", err);
    res.status(500).json({ error: err.message });
  }
}
