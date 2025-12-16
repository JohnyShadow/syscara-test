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
  const modelAdd = ad.model?.model_add || ""; // ✅ NEU

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
  // 4) Maße & Gewichte
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

  const gesamtmasse = ad.weights?.total
    ? String(ad.weights.total)
    : "";

  // ------------------------------------------------
  // 5) Zulassung / Innenraum
  // ------------------------------------------------
  const erstzulassung = ad.date?.registration || "";

  const schlafplatz = ad.beds?.num
    ? String(ad.beds.num)
    : "";

  const bett = Array.isArray(ad.beds?.beds)
    ? ad.beds.beds.map((b) => b.type).join(", ")
    : "";

  const sitzgruppe = Array.isArray(ad.seating?.seatings)
    ? ad.seating.seatings.map((s) => s.type).join(", ")
    : "";

  // ------------------------------------------------
  // 6) Technik
  // ------------------------------------------------
  const ps =
    ad.engine?.ps != null ? String(ad.engine.ps) : "";

  const kw =
    ad.engine?.kw != null ? String(ad.engine.kw) : "";

  const kraftstoff = ad.engine?.fuel || "";

  const getriebe = ad.engine?.gear || "";

  // ------------------------------------------------
  // 7) Texte
  // ------------------------------------------------
  const beschreibung =
    ad.texts?.description ||
    ad.description ||
    "";

  // ------------------------------------------------
  // 8) Verkauf / Miete
  // ------------------------------------------------
  const verkaufMiete =
    ad.category === "Rent" ? "miete" : "verkauf";

  // ------------------------------------------------
  // 9) Geräte-ID
  // ------------------------------------------------
  const geraetId = ad.identifier?.internal
    ? String(ad.identifier.internal)
    : "";

  // ------------------------------------------------
  // 10) Features → SLUGS
  // ------------------------------------------------
  const features = Array.isArray(ad.features) ? ad.features : [];

  const featureSlugs = features.map((f) =>
    String(f).toLowerCase().replace(/_/g, "-")
  );

  // ------------------------------------------------
  // 11) Media-Cache
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
  // 12) RÜCKGABE
  // ------------------------------------------------
  return {
    name,
    slug,
    "fahrzeug-id": vehicleId,

    hersteller: producer,
    serie: series,
    modell: model,
    "modell-zusatz": modelAdd, // ✅ NEU

    fahrzeugart,
    fahrzeugtyp,
    zustand,

    baujahr,
    kilometer,
    preis,

    breite,
    hoehe,
    laenge,
    gesamtmasse,

    erstzulassung,
    schlafplatz,
    bett,
    sitzgruppe,

    ps,
    kw,
    kraftstoff,
    getriebe,

    beschreibung,

    "geraet-id": geraetId,
    "verkauf-miete": verkaufMiete,

    featureSlugs,

    "media-cache": mediaCache,
  };
}
