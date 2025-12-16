// pages/api/ads-public.js

export default async function handler(req, res) {
  try {
    const { SYS_API_USER, SYS_API_PASS } = process.env;

    if (!SYS_API_USER || !SYS_API_PASS) {
      return res.status(500).json({
        error: "Missing SYS_API_USER or SYS_API_PASS",
      });
    }

    const auth = Buffer.from(
      `${SYS_API_USER}:${SYS_API_PASS}`
    ).toString("base64");

    // ------------------------------------------------
    // 1) Alle Ads laden (RAW)
    // ------------------------------------------------
    const response = await fetch("https://api.syscara.com/sale/ads/", {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        error: "Syscara error",
        status: response.status,
        raw: text,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid JSON from Syscara",
        raw: text,
      });
    }

    const ads = Object.values(data);
    const total = ads.length;

    // ------------------------------------------------
    // 2) Filterlogik (wie Embed / Public)
    // ------------------------------------------------
    const stats = {
      total,
      public: 0,
      sale: 0,
      rent: 0,
      excluded: 0,
      excludedReasons: {},
      sampleExcluded: [],
      sampleIncluded: [],
    };

    function exclude(reason, ad) {
      stats.excluded++;
      stats.excludedReasons[reason] =
        (stats.excludedReasons[reason] || 0) + 1;

      if (stats.sampleExcluded.length < 10) {
        stats.sampleExcluded.push({
          id: ad.id,
          category: ad.category,
          status: ad.status,
          type: ad.type,
          reason,
        });
      }
    }

    function include(ad) {
      stats.public++;

      if (ad.category === "Sale") stats.sale++;
      if (ad.category === "Rent") stats.rent++;

      if (stats.sampleIncluded.length < 10) {
        stats.sampleIncluded.push({
          id: ad.id,
          name: [
            ad.model?.producer,
            ad.model?.series,
            ad.model?.model,
          ]
            .filter(Boolean)
            .join(" "),
          category: ad.category,
          type: ad.type,
        });
      }
    }

    // ------------------------------------------------
    // 3) Durch alle Ads iterieren
    // ------------------------------------------------
    for (const ad of ads) {
      // ❌ kein Fahrzeugtyp
      if (!ad.type) {
        exclude("missing_type", ad);
        continue;
      }

      // ❌ kein Reisemobil / Wohnwagen
      if (!["Reisemobil", "Wohnwagen"].includes(ad.type)) {
        exclude("wrong_type", ad);
        continue;
      }

      // ❌ keine Kategorie
      if (!ad.category) {
        exclude("missing_category", ad);
        continue;
      }

      // ❌ nicht Verkauf oder Miete
      if (!["Sale", "Rent"].includes(ad.category)) {
        exclude("not_sale_or_rent", ad);
        continue;
      }

      // ❌ inaktiv (falls vorhanden)
      if (ad.status && ad.status !== "active") {
        exclude("inactive_status", ad);
        continue;
      }

      // ❌ explizit deaktiviert
      if (ad.active === false) {
        exclude("active_false", ad);
        continue;
      }

      // ✅ öffentliches Fahrzeug
      include(ad);
    }

    // ------------------------------------------------
    // 4) Ergebnis
    // ------------------------------------------------
    return res.status(200).json({
      totalVehicles: stats.total,
      publicVehicles: stats.public,
      sale: stats.sale,
      rent: stats.rent,
      excluded: stats.excluded,
      excludedReasons: stats.excludedReasons,
      sampleIncluded: stats.sampleIncluded,
      sampleExcluded: stats.sampleExcluded,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
}
