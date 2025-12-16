// pages/api/ads-public.js

export default async function handler(req, res) {
  try {
    const { SYS_API_USER, SYS_API_PASS } = process.env;

    const auth = Buffer.from(
      `${SYS_API_USER}:${SYS_API_PASS}`
    ).toString("base64");

    const response = await fetch("https://api.syscara.com/sale/ads/", {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const data = await response.json();
    const ads = Object.values(data);

    const stats = {
      totalVehicles: ads.length,
      publicVehicles: 0,
      reisemobile: 0,
      caravans: 0,
      excluded: 0,
      excludedReasons: {},
      sampleIncluded: [],
      sampleExcluded: [],
    };

    function exclude(reason, ad) {
      stats.excluded++;
      stats.excludedReasons[reason] =
        (stats.excludedReasons[reason] || 0) + 1;

      if (stats.sampleExcluded.length < 10) {
        stats.sampleExcluded.push({
          id: ad.id,
          type: ad.type,
          status: ad.status,
          reason,
        });
      }
    }

    function include(ad) {
      stats.publicVehicles++;

      if (ad.type === "Reisemobil") stats.reisemobile++;
      if (ad.type === "Caravan") stats.caravans++;

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
          type: ad.type,
        });
      }
    }

    for (const ad of ads) {
      // ❌ nicht verfügbar
      if (ad.status !== "BE") {
        exclude("status_not_BE", ad);
        continue;
      }

      // ❌ kein relevantes Fahrzeug
      if (!["Reisemobil", "Caravan"].includes(ad.type)) {
        exclude("wrong_type", ad);
        continue;
      }

      // ✅ öffentlich
      include(ad);
    }

    return res.status(200).json(stats);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}
