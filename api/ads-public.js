// pages/api/ads-public.js

function toNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  try {
    const { SYS_API_USER, SYS_API_PASS } = process.env;

    if (!SYS_API_USER || !SYS_API_PASS) {
      return res.status(500).json({
        error: "Missing ENV vars (SYS_API_USER, SYS_API_PASS)",
      });
    }

    const auth = Buffer.from(`${SYS_API_USER}:${SYS_API_PASS}`).toString("base64");

    const response = await fetch("https://api.syscara.com/sale/ads/", {
      headers: { Authorization: `Basic ${auth}` },
    });

    const raw = await response.text();
    if (!response.ok) {
      return res.status(500).json({
        error: "Syscara error",
        status: response.status,
        raw,
      });
    }

    const data = JSON.parse(raw);

    // Syscara liefert { "135965": {...}, ... }
    const all = Object.entries(data).map(([key, ad]) => ({
      id: ad?.id ?? Number(key),
      ...ad,
    }));

    const included = [];
    const excludedReasons = {
      not_visible: 0,
      wrong_type: 0,
      no_price: 0,
    };

    for (const ad of all) {
      // ✅ 1. Sichtbarkeit (NEU)
      if (ad.visible !== true) {
        excludedReasons.not_visible++;
        continue;
      }

      // ✅ 2. Fahrzeugtyp
      if (ad.type !== "Reisemobil" && ad.type !== "Caravan") {
        excludedReasons.wrong_type++;
        continue;
      }

      // ✅ 3. Preis (Verkauf ODER Miete)
      const offer = toNumber(ad?.prices?.offer);
      const rent = toNumber(ad?.prices?.rent);

      if (offer <= 0 && rent <= 0) {
        excludedReasons.no_price++;
        continue;
      }

      included.push(ad);
    }

    const reisemobile = included.filter((a) => a.type === "Reisemobil").length;
    const caravans = included.filter((a) => a.type === "Caravan").length;

    return res.status(200).json({
      totalVehicles: all.length,
      publicVehicles: included.length,
      reisemobile,
      caravans,
      excluded: all.length - included.length,
      excludedReasons,
      sampleIncluded: included.slice(0, 10).map((a) => ({
        id: a.id,
        visible: a.visible,
        status: a.status,
        type: a.type,
        producer: a.model?.producer,
        series: a.model?.series,
        model: a.model?.model,
        offer: a.prices?.offer ?? null,
        rent: a.prices?.rent ?? null,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
}

