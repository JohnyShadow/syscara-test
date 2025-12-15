export function mapVehicle(vehicle) {
  if (!vehicle) return null;

  // Hauptbild + Galerie IDs extrahieren
  const imageIds = Array.isArray(vehicle.media)
    ? vehicle.media.filter(m => m.group === "image").map(m => m.id)
    : [];

  const hauptbild = imageIds.length > 0 ? String(imageIds[0]) : "";

  // Maximal 25 Bilder für Galerie
  const galerie = imageIds.slice(0, 25).map(id => String(id));

  return {
    name: `${vehicle.model?.producer || ""} ${vehicle.model?.model || ""}`.trim(),
    slug: `${vehicle.id}-${(vehicle.model?.model || "").toLowerCase().replace(/\s+/g, "-")}`,

    hersteller: String(vehicle.model?.producer || ""),
    serie: String(vehicle.model?.series || ""),
    modell: String(vehicle.model?.model || ""),
    modell_zusatz: String(vehicle.model?.model_add || ""),

    zustand: String(vehicle.condition || ""),
    fahrzeugart: String(vehicle.type || ""),
    fahrzeugtyp: String(vehicle.typeof || ""),

    ps: String(vehicle.engine?.ps || ""),
    kw: String(vehicle.engine?.kw || ""),
    kraftstoff: String(vehicle.engine?.fuel || ""),
    getriebe: String(vehicle.engine?.gear || ""),

    beschreibung: String(vehicle.texts?.description_plain || ""),
    beschreibung_kurz: String(vehicle.texts?.internal || ""),

    kilometer: String(vehicle.mileage || ""),
    baujahr: String(vehicle.model?.modelyear || ""),

    preis: String(vehicle.prices?.offer || ""),
    breite: String(vehicle.dimensions?.width || ""),
    hoehe: String(vehicle.dimensions?.height || ""),
    laenge: String(vehicle.dimensions?.length || ""),

    geraet_id: String(vehicle.id || ""),

    hauptbild: hauptbild,
    galerie: galerie,

    // dein neues Feld "verkauf_miete"
    verkauf_miete: String(vehicle.status || ""),
  };
}
