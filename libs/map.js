// /libs/map.js

export function mapVehicle(ad) {
  if (!ad || typeof ad !== "object") return null;

  // Safeguard helpers
  const safe = (value, fallback = "") =>
    value === undefined || value === null ? fallback : value;

  const model = ad.model || {};
  const engine = ad.engine || {};
  const dimensions = ad.dimensions || {};
  const media = Array.isArray(ad.media) ? ad.media : [];
  const texts = ad.texts || {};
  const location = ad.location || {};
  const prices = ad.prices || {};

  // Verkauf oder Miete bestimmen
  let verkauf_miete = "kauf";
  if ((location.name || "").toLowerCase().includes("miet")) {
    verkauf_miete = "miete";
  }

  // Galerie IDs
  const galleryImages = media
    .map((m) => m.id)
    .filter((id) => typeof id === "number" || typeof id === "string")
    .slice(0, 25);

  return {
    originalId: ad.id,

    // -------- Webflow Name + Slug --------
    name: safe(model.model, ""),
    slug: `${ad.id}-fahrzeug`,

    // -------- Fahrzeugdaten --------
    hersteller: safe(model.producer),
    serie: safe(model.series),
    modell: safe(model.model),
    "modell-zusatz": safe(model.model_add),

    zustand: safe(ad.condition),
    fahrzeugart: safe(ad.type),
    fahrzeugtyp: safe(ad.typeof),

    ps: safe(engine.ps, ""),
    kw: safe(engine.kw, ""),
    kraftstoff: safe(engine.fuel, ""),
    getriebe: safe(engine.gear, ""),

    beschreibung: safe(texts.description),
    "beschreibung-kurz": safe(texts.description_plain),

    kilometer: safe(ad.mileage, ""),
    baujahr: safe(model.modelyear, ""),
    preis: safe(prices.offer, ""),

    breite: safe(dimensions.width, ""),
    hoehe: safe(dimensions.height, ""),
    laenge: safe(dimensions.length, ""),

    "geraet-id": String(ad.id),

    // -------- Bilder --------
    hauptbild: media.length > 0 ? media[0].id : "",
    galerie: galleryImages,

    // -------- Zusatz --------
    "verkauf-miete": verkauf_miete
  };
}

