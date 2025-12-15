// libs/map.js

// Hilfsfunktion: Werte normalisieren (Webflow will Strings)
function normalizeValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return value;
}

export function mapVehicle(syscara) {

  // Name korrekt zusammensetzen
  const name =
    `${syscara.model?.producer ?? ""} ${syscara.model?.series ?? ""} ${syscara.model?.model ?? ""}`
      .replace(/\s+/g, " ")
      .trim();

  // Slug generieren
  const slug = `${syscara.id}-${(syscara.model?.producer ?? "fahrzeug")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;

  // Galerie-ID-Liste max 25
  const gallery = (syscara.media ?? [])
    .filter(m => m.group === "image")
    .map(m => m.id)
    .slice(0, 25);

  // **********************
  //  MAPPED OUTPUT
  //  (ALLE Keys bereits Bindestriche!)
  // **********************

  const mapped = {
    name,
    slug,

    hersteller: syscara.model?.producer ?? "",
    serie: syscara.model?.series ?? "",
    modell: syscara.model?.model ?? "",
    "modell-zusatz": syscara.model?.model_add ?? "",

    zustand: syscara.condition ?? "",
    fahrzeugart: syscara.type ?? "",
    fahrzeugtyp: syscara.typeof ?? "",

    ps: syscara.engine?.ps ?? "",
    kw: syscara.engine?.kw ?? "",
    kraftstoff: syscara.engine?.fuel ?? "",
    getriebe: syscara.engine?.gear ?? "",

    beschreibung: syscara.texts?.description ?? "",
    "beschreibung-kurz": syscara.texts?.description_plain ?? "",

    kilometer: syscara.mileage ?? "",
    baujahr: syscara.model?.modelyear ?? "",

    preis: syscara.prices?.offer ?? "",
    breite: syscara.dimensions?.width ?? "",
    hoehe: syscara.dimensions?.height ?? "",
    laenge: syscara.dimensions?.length ?? "",

    "geraet-id": syscara.id ?? "",
    "verkauf-miete": syscara.flags?.includes("RENTAL_CAR") ? "miete" : "kauf",

    hauptbild: (gallery.length > 0 ? gallery[0] : ""),
    galerie: gallery
  };

  // ALLE Werte als Strings finalisieren
  const cleaned = {};
  for (const key in mapped) {
    cleaned[key] = normalizeValue(mapped[key]);
  }

  return {
    originalId: syscara.id,
    mapped: cleaned
  };
}

