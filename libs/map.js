// libs/map.js

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Umlaute entfernen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function mapVehicle(ad) {
  // ----------------------------------------------------
  // 1) Echte Fahrzeugdaten extrahieren
  // Syscara liefert manchmal: { "135965": { ... } }
  // ----------------------------------------------------
  let vehicleId = null;

  if (typeof ad === "object" && !ad.id) {
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
  // 2) Daten aus Modelldaten holen
  // ----------------------------------------------------
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";
  const model_add = ad.model?.model_add || ""; // kommt NICHT in den Namen

  // ----------------------------------------------------
  // 3) Name bauen: Hersteller + Serie + Modell + (ID)
  // garantiert eindeutig, duplicate-safe
  // ----------------------------------------------------
  const baseName = [producer, series, model].filter(Boolean).join(" ");
  const finalName = vehicleId
    ? `${baseName} (${vehicleId})`
    : baseName || "Fahrzeug ohne ID";

  // ----------------------------------------------------
  // 4) Slug aus dem finalen Namen bauen
  // ----------------------------------------------------
  const slugBase = slugify(finalName);
  const slug = vehicleId ? `${vehicleId}-${slugBase}` : slugBase;

  // ----------------------------------------------------
  // 5) Minimales Mapping + Extra-Feld für model_add
  // Webflow benötigt nur name + slug für Pflichtfelder
  // ----------------------------------------------------
  return {
    name: finalName,
    slug,
    "fahrzeug-id": vehicleId,
    "modell-zusatz": model_add || ""
  };
}

