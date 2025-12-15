export function mapVehicle(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return null;

  const producer = vehicle.model?.producer || "";
  const series = vehicle.model?.series || "";
  const model = vehicle.model?.model || "";
  const modelAdd = vehicle.model?.model_add || "";

  // Fallback Name unbedingt sicher
  const name = `${producer} ${model}`.trim() || `Fahrzeug-${vehicle.id}`;

  // Bilder
  const imageIds = Array.isArray(vehicle.media)
    ? vehicle.media.filter(m => m.group === "image").map(m => m.id)
    : [];

  const hauptbild = imageIds?.[0] ? String(imageIds[0]) : "";
  const galerie = imageIds.slice(0, 25).map(id => String(id));

  return {
    name,
    slug: `${vehicle.id}-${model.toLowerCase().replace(/\s+/g, "-")}`,

    hersteller: String(producer),
    serie: String(series),
    modell: String(model),
    modell_zusatz: String(modelAdd),

    zustand: String(vehicle.condition || ""),
    fahrzeugart: String(vehicle.type || ""),
    fahrzeugtyp: String(vehicle.typeof || ""),

    ps: String(vehicle.engine?.ps ?? ""),
    kw: String(vehicle.engine?.kw ?? ""),
    kraftstoff: String(vehicle.engine?.fuel ?? ""),
    getriebe: String(vehicle.engine?.gear ?? ""),

    beschreibung: String(vehicle.texts?.description_plain ?? ""),
    beschreibung_kurz: String(vehicle.texts?.internal ?? ""),

    kilometer: String(vehicle.mileage ?? ""),
    baujahr: String(vehicle.model?.modelyear ?? ""),

    preis: String(vehicle.prices?.offer ?? ""),
    breite: String(vehicle.dimensions?.width ?? ""),
    hoehe: String(vehicle.dimensions?.height ?? ""),
    laenge: String(vehicle.dimensions?.length ?? ""),

    geraet_id: String(vehicle.id || ""),

    hauptbild,
    galerie,

    verkauf_miete: String(vehicle.status || ""),
  };
}
