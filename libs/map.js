// libs/map.js

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function mapVehicle(input) {
  // ----------------------------------------------------
  // 1) Syscara-Response NORMALISIEREN (WICHTIG!)
  // ----------------------------------------------------
  let ad = input;

  // Variante: { "135965": { ... } }
  if (!ad.id && typeof ad === "object") {
    const keys = Object.keys(ad);
    if (keys.length === 1 && typeof ad[keys[0]] === "object") {
      ad = ad[keys[0]];
    }
  }

  // Variante: { DATA: { "135965": { ... } } }
  if (!ad.id && ad.DATA) {
    const keys = Object.keys(ad.DATA);
    if (keys.length === 1) {
      ad = ad.DATA[keys[0]];
    }
  }

  // ----------------------------------------------------
  // 2) Fahrzeug-ID (JETZT zuverlässig)
  // ----------------------------------------------------
  const vehicleId = ad?.id ? String(ad.id) : "";

  // ----------------------------------------------------
  // 3) Name & Slug
  // ----------------------------------------------------
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";

  const name =
    [producer, series, model].filter(Boolean).join(" ") ||
    `Fahrzeug ${vehicleId || "unbekannt"}`;

  const slug = vehicleId
    ? `${vehicleId}-${slugify(name)}`
    : slugify(name);

  // ----------------------------------------------------
  // 4) Media-Cache (IDs ONLY)
  // ----------------------------------------------------
  const media = Array.isArray(ad.media) ? ad.media : [];

  const images = media.filter(
    (m) => m && m.group === "image" && m.id
  );

  const grundriss = media.find(
    (m) => m && m.group === "layout"
  )?.id || null;

  const mediaCache = JSON.stringify({
    hauptbild: images[0]?.id || null,
    galerie: images.map((m) => m.id),
    grundriss,
  });

  // ----------------------------------------------------
  // 5) Rückgabe (nichts entfernt!)
  // ----------------------------------------------------
  return {
    name,
    slug,
    "fahrzeug-id": vehicleId,
    "media-cache": mediaCache,
  };
}

