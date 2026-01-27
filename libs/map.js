// libs/map.js
function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function mapVehicle(ad) {
  const vehicleId = ad?.id ? String(ad.id) : "";

  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";
  const modelAdd = ad.model?.model_add || "";

  const name =
    [producer, series, model].filter(Boolean).join(" ") ||
    `Fahrzeug ${vehicleId || "unbekannt"}`;

  const slug = vehicleId
    ? `${vehicleId}-${slugify(name)}`
    : slugify(name);

  /* ---------------- Bettarten ---------------- */
  let rawBeds = [];

  if (Array.isArray(ad.beds?.beds)) {
    rawBeds = ad.beds.beds.map((b) => b?.type);
  } else if (typeof ad.beds?.beds === "string") {
    rawBeds = ad.beds.beds.split(",");
  }

  const bettartenSlugs = rawBeds
    .map((b) => String(b || "").trim())
    .filter(Boolean)
    .map((b) => slugify(b));

  /* ---------------- Features ---------------- */
  const features = Array.isArray(ad.features) ? ad.features : [];
  const featureSlugs = features.map((f) => slugify(String(f)));

  /* ---------------- Media Cache ---------------- */
  const media = Array.isArray(ad.media) ? ad.media : [];
  const images = media.filter((m) => m && m.group === "image" && m.id);
  const grundriss =
    media.find((m) => m && m.group === "layout")?.id || null;

  const mediaCache = JSON.stringify({
    hauptbild: images[0]?.id || null,
    galerie: images.map((m) => m.id),
    grundriss,
  });

  return {
    name,
    slug,
    "fahrzeug-id": vehicleId,

    hersteller: producer,
    serie: series,
    modell: model,
    "modell-zusatz": modelAdd,

    zustand: ad.condition || "",
    fahrzeugart: ad.type || "",
    fahrzeugtyp: ad.typeof || "",

    baujahr: ad.model?.modelyear
      ? String(ad.model.modelyear)
      : "",
    kilometer:
      ad.mileage != null && ad.mileage !== 0
        ? String(ad.mileage)
        : "",
    preis:
      ad.prices?.offer != null
        ? String(ad.prices.offer)
        : "",

    ps: ad.engine?.ps != null ? String(ad.engine.ps) : "",
    kw: ad.engine?.kw != null ? String(ad.engine.kw) : "",
    kraftstoff: ad.engine?.fuel || "",
    getriebe: ad.engine?.gear || "",

    beschreibung:
      ad.texts?.description || ad.description || "",

    "verkauf-miete":
      ad.category === "Rent" ? "miete" : "verkauf",

    /* ---------------- Neue Felder ---------------- */
    breite: ad.dimensions?.width != null ? String(ad.dimensions.width) : "",
    hoehe: ad.dimensions?.height != null ? String(ad.dimensions.height) : "",
    laenge: ad.dimensions?.length != null ? String(ad.dimensions.length) : "",
    gesamtmasse: ad.weights?.total != null ? String(ad.weights.total) : "",
    schlafplatz: ad.beds?.num != null ? String(ad.beds.num) : "",

    featureSlugs,
    bettartenSlugs,

    "media-cache": mediaCache,
  };
}
