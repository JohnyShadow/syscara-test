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
  // 1. ID bestimmen
  const id = ad.id ?? ad.identifier?.internal ?? ad.identifier?.serial;

  // 2. Name bauen aus Modelldaten
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";
  const model_add = ad.model?.model_add || "";

  const nameParts = [producer, series, model, model_add].filter(Boolean);
  const name =
    nameParts.join(" ").trim() || `Fahrzeug ${id || "ohne-id"}`;

  // 3. Slug bauen
  const slugBase = slugify(name || `fahrzeug-${id || "unknown"}`);
  const slug = id ? `${id}-${slugBase}` : slugBase;

  // 4. MINIMALES Feldset für Webflow
  return {
    name,            // Pflichtfeld in Webflow
    slug,            // sehr nützlich
    "geraet-id": String(id || ""), // damit wir das Fahrzeug wiederfinden können
  };
}

