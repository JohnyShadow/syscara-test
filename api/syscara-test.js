// pages/api/syscara-test.js
import { mapVehicle } from "../libs/map.js";

export default async function handler(req, res) {
  try {
    const { SYS_API_USER, SYS_API_PASS } = process.env;

    if (!SYS_API_USER || !SYS_API_PASS) {
      return res.status(500).json({
        error: "Missing SYS_API_USER or SYS_API_PASS",
      });
    }

    // ------------------------------------------------
    // 1) Alle Fahrzeuge von Syscara laden
    // ------------------------------------------------
    const auth = Buffer.from(
      `${SYS_API_USER}:${SYS_API_PASS}`
    ).toString("base64");

    const response = await fetch("https://api.syscara.com/sale/ads/", {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({
        error: "Syscara error",
        status: response.status,
        details: text,
      });
    }

    const rawText = await response.text();
    let ads;

    try {
      ads = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid JSON from Syscara",
        raw: rawText,
      });
    }

    const entries = Object.entries(ads);

    // ------------------------------------------------
    // 2) FILTER: NUR Standort Osterrönfeld (PLZ 24783)
    // ------------------------------------------------
    const filteredEntries = entries.filter(
      ([, ad]) => ad?.store?.zipcode === "24783"
    );

    // ------------------------------------------------
    // 3) Fahrzeuge mappen (ohne Webflow)
    // ------------------------------------------------
    const results = [];
    let unknownNameCount = 0;
    let missingIdCount = 0;
    let noImagesCount = 0;

    for (const [id, ad] of filteredEntries) {
      const mapped = mapVehicle(ad);

      if (!mapped.name || mapped.name.includes("unbekannt")) {
        unknownNameCount++;
      }

      if (!mapped["fahrzeug-id"]) {
        missingIdCount++;
      }

      let imageCount = 0;
      if (mapped["media-cache"]) {
        try {
          const cache = JSON.parse(mapped["media-cache"]);
          imageCount = Array.isArray(cache.galerie)
            ? cache.galerie.length
            : 0;
          if (imageCount === 0) noImagesCount++;
        } catch {}
      }

      results.push({
        syscaraId: id,
        name: mapped.name,
        slug: mapped.slug,
        images: imageCount,
        zipcode: ad.store?.zipcode,
        city: ad.store?.city,
      });
    }

    // ------------------------------------------------
    // 4) Ausgabe
    // ------------------------------------------------
    return res.status(200).json({
      totalVehiclesSyscara: entries.length,
      vehiclesZip24783: filteredEntries.length,
      mappedVehicles: results.length,
      unknownNames: unknownNameCount,
      missingIds: missingIdCount,
      vehiclesWithoutImages: noImagesCount,
      sample: results.slice(0, 10),
    });
  } catch (err) {
    console.error("SYS TEST ERROR:", err);
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
}

