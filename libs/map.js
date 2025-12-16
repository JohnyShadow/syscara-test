// libs/map.js

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function mapVehicle(ad) {
  // ------------------------------------------------
  // 1) ID
  // ------------------------------------------------
  const vehicleId = ad?.id ? String(ad.id) : "";

  // ------------------------------------------------
  // 2) Name & Slug
  // ------------------------------------------------
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";

  const name =
    [producer, series, model].filter(Boolean).join(" ") ||
    `Fahrzeug ${vehicleId || "unbekannt"}`;

  const slug = vehicleId
    ? `${vehicleId}-${slugify(name)}`
    : slugify(name);

  // ------------------------------------------------
  // 3) Basisdaten
  // ------------------------------------------------
  const zustand = ad.condition || "";
  const fahrzeugart = ad.type || "";
  const fahrzeugtyp = ad.typeof || "";

  const baujahr = ad.model?.modelyear
    ? String(ad.model.modelyear)
    : "";

  const kilometer =
    ad.mileage != null && ad.mileage !== 0
      ? String(ad.mileage)
      : "";

  const preis =
    ad.prices?.offer != null
      ? String(ad.prices.offer)
      : "";

  // ------------------------------------------------
  // 4) Maße
  // ------------------------------------------------
  const breite = ad.dimensions?.width
    ? String(ad.dimensions.width)
    : "";

  const hoehe = ad.dimensions?.height
    ? String(ad.dimensions.height)
    : "";

  const laenge = ad.dimensions?.length
    ? String(ad.dimensions.length)
    : "";

  // ------------------------------------------------
  // 5) Verkauf / Miete
  // ------------------------------------------------
  const verkaufMiete =
    ad.category === "Rent" ? "miete" : "verkauf";

  // ------------------------------------------------
  // 6) Features → SLUGS für sync.js
  // ------------------------------------------------
  const features = Array.isArray(ad.features) ? ad.features : [];

  const featureSlugs = features.map((f) =>
    String(f).toLowerCase().replace(/_/g, "-")
  );

  // ------------------------------------------------
  // 7) Media-Cache
  // ------------------------------------------------
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

  // ------------------------------------------------
  // 8) Rückgabe (VOLLSTÄNDIG)
  // ------------------------------------------------
  return {
    name,
    slug,
    "fahrzeug-id": vehicleId,

    hersteller: producer,
    serie: series,
    modell: model,

    fahrzeugart,
    fahrzeugtyp,
    zustand,

    baujahr,
    kilometer,
    preis,

    breite,
    hoehe,
    laenge,

    "verkauf-miete": verkaufMiete,

    featureSlugs,

    "media-cache": mediaCache,
  };
}
