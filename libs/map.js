// libs/map.js

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function hasFeature(features, key) {
  return features.includes(key) ? "true" : "";
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
  const model_add = ad.model?.model_add || "";

  const baseNameParts = [producer, series, model].filter(Boolean);
  const baseName =
    baseNameParts.join(" ").trim() || `Fahrzeug ${vehicleId || "unbekannt"}`;

  const slug = vehicleId
    ? `${vehicleId}-${slugify(baseName)}`
    : slugify(baseName);

  // ----------------------------------------------------
  // 3) Basisdaten
  // ----------------------------------------------------
  const fahrzeugart = ad.type || "";
  const fahrzeugtyp = ad.typeof || "";
  const zustand = ad.condition || "";

  const baujahr = ad.model?.modelyear ? String(ad.model.modelyear) : "";
  const kilometer =
    ad.mileage != null && ad.mileage !== 0 ? String(ad.mileage) : "";
  const preis = ad.prices?.offer != null ? String(ad.prices.offer) : "";

  const breite = ad.dimensions?.width != null ? String(ad.dimensions.width) : "";
  const hoehe = ad.dimensions?.height != null ? String(ad.dimensions.height) : "";
  const laenge = ad.dimensions?.length != null ? String(ad.dimensions.length) : "";

  // ----------------------------------------------------
  // 4) Technik & Texte
  // ----------------------------------------------------
  const ps = ad.engine?.ps != null ? String(ad.engine.ps) : "";
  const kw = ad.engine?.kw != null ? String(ad.engine.kw) : "";
  const kraftstoff = ad.engine?.fuel || "";
  const getriebe = ad.engine?.gear || "";

  const beschreibung = ad.texts?.description || "";

  const geraetId = ad.identifier?.internal
    ? String(ad.identifier.internal)
    : "";

  const verkaufMiete = "";

  // ----------------------------------------------------
  // 5) Zusatzdaten
  // ----------------------------------------------------
  const gesamtmasse =
    ad.weights?.total != null ? String(ad.weights.total) : "";

  const erstzulassung = ad.date?.registration || "";

  const schlafplatz =
    ad.beds?.num != null ? String(ad.beds.num) : "";

  const bett = Array.isArray(ad.beds?.beds)
    ? ad.beds.beds.map((b) => b.type).join(", ")
    : "";

  const sitzgruppe = Array.isArray(ad.seating?.seatings)
    ? ad.seating.seatings.map((s) => s.type).join(", ")
    : "";

  // ----------------------------------------------------
  // 6) Highlights
  // ----------------------------------------------------
  const features = Array.isArray(ad.features) ? ad.features : [];

  const tv = hasFeature(features, "tv");
  const satAntenne = hasFeature(features, "sat");
  const rueckfahrkamera = hasFeature(features, "rueckfahrkamera");
  const tempomat = hasFeature(features, "tempomat");
  const markise = hasFeature(features, "markise");
  const fahrradtraeger = hasFeature(features, "fahrradtraeger");
  const klimaanlage = hasFeature(features, "klimaanlage");
  const servolenkung = hasFeature(features, "servolenkung");
  const mover = hasFeature(features, "mover");
  const ssk = hasFeature(features, "antischlingerkupplung");
  const zentralverriegelung = hasFeature(features, "zentralverriegelung");
  const heckgarage = hasFeature(features, "heckgarage");

  // ----------------------------------------------------
  // 7) Media Cache (inkl. Grundriss)
  // ----------------------------------------------------
  const media = Array.isArray(ad.media) ? ad.media : [];

  const imageIds = media
    .filter((m) => m && m.group === "image" && m.id != null)
    .map((m) => m.id);

  const layoutImage = media.find(
    (m) => m && m.group === "layout" && m.id != null
  );

  const mediaCache = JSON.stringify({
    hauptbild: imageIds[0] || null,
    galerie: imageIds,
    grundriss: layoutImage?.id || null,
  });

  // ----------------------------------------------------
  // 8) Rückgabe
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

    "geraet-id": geraetId,
    "verkauf-miete": verkaufMiete,

    gesamtmasse,
    erstzulassung,
    schlafplatz,
    bett,
    sitzgruppe,

    tv,
    "sat-antenne": satAntenne,
    rueckfahrkamera,
    tempomat,
    markise,
    fahrradtraeger,
    klimaanlage,
    servolenkung,
    mover,
    ssk,
    zentralverriegelung,
    heckgarage,

    "media-cache": mediaCache,
  };
}
