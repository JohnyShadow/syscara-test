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
  // 1) Sonderfall: { "135965": { ... } }
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
  // 2) Name & Slug (OHNE modell-zusatz)
  // ----------------------------------------------------
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";
  const model_add = ad.model?.model_add || "";

  const baseNameParts = [producer, series, model].filter(Boolean);
  const baseName =
    baseNameParts.join(" ").trim() || `Fahrzeug ${vehicleId || "unbekannt"}`;

  const slugBase = slugify(baseName);
  const slug = vehicleId ? `${vehicleId}-${slugBase}` : slugBase;

  // ----------------------------------------------------
  // 3) Basisdaten
  // ----------------------------------------------------
  const fahrzeugart = ad.type || "";
  const fahrzeugtyp = ad.typeof || "";
  const zustand = ad.condition || "";

  const baujahr = ad.model?.modelyear
    ? String(ad.model.modelyear)
    : "";

  const kilometer =
    ad.mileage != null && ad.mileage !== 0 ? String(ad.mileage) : "";

  const preis =
    ad.prices?.offer != null ? String(ad.prices.offer) : "";

  const breite =
    ad.dimensions?.width != null ? String(ad.dimensions.width) : "";

  const hoehe =
    ad.dimensions?.height != null ? String(ad.dimensions.height) : "";

  const laenge =
    ad.dimensions?.length != null ? String(ad.dimensions.length) : "";

  // ----------------------------------------------------
  // 4) NEU: Technik & Texte
  // ----------------------------------------------------
  const ps =
    ad.engine?.ps != null ? String(ad.engine.ps) : "";

  const kw =
    ad.engine?.kw != null ? String(ad.engine.kw) : "";

  const kraftstoff = ad.engine?.fuel || "";
  const getriebe = ad.engine?.gear || "";

  const beschreibung = ad.texts?.description || "";
  const beschreibung_kurz = ad.texts?.description_plain || "";

  const geraetId = ad.identifier?.internal
    ? String(ad.identifier.internal)
    : "";

  // Verkauf / Miete – Logik kommt später
  const verkaufMiete = "";

  // ----------------------------------------------------
  // 5) MEDIA-CACHE (Version A – nur IDs)
  // ----------------------------------------------------
  const media = Array.isArray(ad.media) ? ad.media : [];

  const imageIds = media
    .filter((m) => m && m.group === "image" && m.id != null)
    .map((m) => m.id);

  const mainImageId = imageIds.length > 0 ? imageIds[0] : null;

  const mediaCacheJson = JSON.stringify({
    hauptbild: mainImageId,
    galerie: imageIds,
  });

  // ----------------------------------------------------
  // 6) Rückgabe für Webflow
  // ----------------------------------------------------
  return {
    name: baseName,
    slug,
    "fahrzeug-id": vehicleId,

    hersteller: producer,
    serie: series,
    modell: model,
    "modell-zusatz": model_add,

    fahrzeugart,
    fahrzeugtyp,
    zustand,
    baujahr,
    kilometer,
    preis,
    breite,
    hoehe,
    laenge,

    ps,
    kw,
    kraftstoff,
    getriebe,

    beschreibung,
    "beschreibung-kurz": beschreibung_kurz,

    "geraet-id": geraetId,
    "verkauf-miete": verkaufMiete,

    // Media nur gecached
    "media-cache": mediaCacheJson,
  };
}
