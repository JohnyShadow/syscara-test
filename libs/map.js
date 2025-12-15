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
  // 1) Syscara liefert manchmal: { "135965": { ... }}
  // → das echte Objekt herausziehen
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
  // 2) Fahrzeugdaten holen
  // ----------------------------------------------------
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";
  const model_add = ad.model?.model_add || ""; // separat → nicht im Titel

  // ----------------------------------------------------
  // 3) Name = Hersteller + Serie + Modell + (ID)
  // ----------------------------------------------------
  const baseName = [producer, series, model].filter(Boolean).join(" ");
  const finalName = vehicleId
    ? `${baseName} (${vehicleId})`
    : baseName || "Fahrzeug ohne ID";

  // ----------------------------------------------------
  // 4) Slug (ID nur einmal!)
  // Beispiel: 135965-dethleffs-just-90-t-6752-dbl
  // ----------------------------------------------------
  const slugName = slugify(baseName);         // OHNE (ID)
  const slug = vehicleId
    ? `${vehicleId}-${slugName}`
    : slugName;

  // ----------------------------------------------------
  // 5) Minimales Webflow-Mapping
  // ----------------------------------------------------
  return {
    name: finalName,
    slug,
    "fahrzeug-id": vehicleId,
    "modell-zusatz": model_add || ""
  };
}
