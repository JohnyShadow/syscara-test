// pages/api/bettarten.js

export default async function handler(req, res) {
  try {
    const { SYS_API_USER, SYS_API_PASS } = process.env;

    if (!SYS_API_USER || !SYS_API_PASS) {
      return res.status(500).json({
        error: "Fehlende ENV Variablen (SYS_API_USER, SYS_API_PASS)",
      });
    }

    // 🔹 Syscara API
    const sysUrl = "https://api.syscara.com/sale/ads/";

    const response = await fetch(sysUrl, {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64"),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({
        error: "Syscara Request fehlgeschlagen",
        details: text,
      });
    }

    const data = await response.json();

    // 🔹 Bettarten-Zähler
    const bedCounter = {};

    // Syscara liefert { "135965": { ... }, ... }
    for (const key of Object.keys(data)) {
      const ad = data[key];

      let bedsRaw = [];

      // Variante A: Array [{ type: "ALCOVE_BED" }]
      if (Array.isArray(ad?.beds?.beds)) {
        bedsRaw = ad.beds.beds
          .map((b) => b?.type)
          .filter(Boolean);
      }

      // Variante B: String "ALCOVE_BED,DOUBLE_BED"
      else if (typeof ad?.beds?.beds === "string") {
        bedsRaw = ad.beds.beds
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean);
      }

      bedsRaw.forEach((bed) => {
        if (!bedCounter[bed]) {
          bedCounter[bed] = 0;
        }
        bedCounter[bed]++;
      });
    }

    // 🔹 Sortieren nach Häufigkeit
    const sortedBeds = Object.entries(bedCounter)
      .sort((a, b) => b[1] - a[1])
      .map(([bettart, count]) => ({
        bettart,
        count,
        slug: bettart.toLowerCase().replace(/_/g, "-"),
      }));

    return res.status(200).json({
      totalVehicles: Object.keys(data).length,
      totalBettarten: sortedBeds.length,
      bettarten: sortedBeds,
    });
  } catch (err) {
    console.error("Bettarten Scan Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
