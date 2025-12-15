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
  // 1) Syscara liefert häufig:
  //    { "135965": { ... }}
  //    → wir müssen erst das echte Fahrzeugobjekt extrahieren
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

  // Falls weiterhin keine ID → leerer String
  vehicleId = vehicleId ? String(vehicleId) : "";

  // ----------------------------------------------------
  // 2) Name bauen aus Modelldaten
  // ----------------------------------------------------
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";
  const model_add = ad.model?.model_add || "";

  const nameParts = [producer, series, model, model_add].filter(Boolean);
  const name = nameParts.join(" ").trim() || `Fahrzeug ${vehicleId || "unbekannt"}`;

  // ----------------------------------------------------
  // 3) Slug bauen
  // ----------------------------------------------------
  const slugBase = slugify(name);
  const slug = vehicleId ? `${vehicleId}-${slugBase}` : slugBase;

  // ----------------------------------------------------
  // 4) Minimales Mapping zurückgeben
  // ----------------------------------------------------
  return {
    name,
    slug,
    "fahrzeug-id": vehicleId // ← WICHTIG: das ist DIE echte ID!
  };
}
