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
  // ----------------------------------------------------
  // 1) Objekt normalisieren
  // ----------------------------------------------------
  let vehicleId = null;

  if (typeof ad === "object" && ad !== null && !ad.id) {
    const keys = Object.keys(ad);
    if (keys.length > 0) {
      vehicleId = keys[0];
      ad = ad[vehicleId];
    }
  } else {
    vehicleId = ad.id;
  }

  vehicleId = vehicleId ? String(vehicleId) : "";

  // ----------------------------------------------------
  // 2) Name & Slug
  // ----------------------------------------------------
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";

  const baseName =
    [producer, series, model].filter(Boolean).join(" ").trim() ||
    `Fahrzeug ${vehicleId || "unbekannt"}`;

  const slug = vehicleId
    ? `${vehicleId}-${slugify(baseName)}`
    : slugify(baseName);

  // ----------------------------------------------------
  // 3) Basisdaten
  // ----------------------------------------------------
  const mapped = {
    name: baseName,
    slug,
    "fahrzeug-id": vehicleId,

    hersteller: producer,
    serie: series,
    modell: model,
    "modell-zusatz": ad.model?.model_add || "",

    fahrzeugart: ad.type || "",
    fahrzeugtyp: ad.typeof || "",
    zustand: ad.condition || "",

    baujahr: ad.model?.modelyear ? String(ad.model.modelyear) : "",
    kilometer:
      ad.mileage != null && ad.mileage !== 0 ? String(ad.mileage) : "",
    preis: ad.prices?.offer != null ? String(ad.prices.offer) : "",

    breite: ad.dimensions?.width ? String(ad.dimensions.width) : "",
    hoehe: ad.dimensions?.height ? String(ad.dimensions.height) : "",
    laenge: ad.dimensions?.length ? String(ad.dimensions.length) : "",

    ps: ad.engine?.ps != null ? String(ad.engine.ps) : "",
    kw: ad.engine?.kw != null ? String(ad.engine.kw) : "",
    kraftstoff: ad.engine?.fuel || "",
    getriebe: ad.engine?.gear || "",

    beschreibung: ad.texts?.description || "",

    "geraet-id": ad.identifier?.internal
      ? String(ad.identifier.internal)
      : "",

    // 👇 WICHTIG: HIER NUR FEATURE-SLUGS
    featureSlugs: Array.isArray(ad.features)
      ? ad.features.map((f) =>
          slugify(f.replace(/_/g, " "))
        )
      : [],
  };

  // ----------------------------------------------------
  // 4) Media Cache (IDs only)
  // ----------------------------------------------------
  const media = Array.isArray(ad.media) ? ad.media : [];
  const imageIds = media
    .filter((m) => m && m.group === "image" && m.id != null)
    .map((m) => m.id);

  mapped["media-cache"] = JSON.stringify({
    hauptbild: imageIds[0] || null,
    galerie: imageIds,
  });

  return mapped;
}
