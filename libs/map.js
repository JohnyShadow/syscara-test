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
  // 1) DAS WAR DER ENTSCHEIDENDE TEIL (hat früher funktioniert)
  //    Syscara liefert: { "135965": { ... } }
  // ----------------------------------------------------
  let ad = input;
  let vehicleId = "";

  if (typeof ad === "object" && ad !== null && !ad.id) {
    const keys = Object.keys(ad);
    if (keys.length === 1 && typeof ad[keys[0]] === "object") {
      vehicleId = keys[0];
      ad = ad[keys[0]];
    }
  }

  if (!vehicleId && ad?.id) {
    vehicleId = String(ad.id);
  }

  // ----------------------------------------------------
  // 2) Name & Slug (DAS HAT SCHON FUNKTIONIERT)
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
  // 3) Media (wie bei deinem funktionierenden Stand)
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
  // 4) Rückgabe – MINIMAL + ERWEITERBAR
  // ----------------------------------------------------
  return {
    name,
    slug,
    "fahrzeug-id": vehicleId,
    "media-cache": mediaCache,

    // alles andere bleibt UNBERÜHRT
  };
}
