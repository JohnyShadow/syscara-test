export function mapAdToWebflow(ad) {
  const vehicle = ad.vehicle || {};
  const engine = vehicle.engine || {};
  const dims = vehicle.dimensions || {};

  return {
    name: `${ad.manufacturer || ""} ${ad.model || ""}`.trim(),
    slug: `${ad.manufacturer}-${ad.model}-${ad.id}`.toLowerCase().replace(/\s+/g, "-"),

    hersteller: ad.manufacturer || "",
    serie: ad.series || "",
    modell: ad.model || "",
    modell_zusatz: ad.model_detail || "",

    zustand: ad.condition || "",
    fahrzeugart: ad.category || "",
    fahrzeugtyp: ad.type || "",

    ps: engine.ps?.toString() || "",
    kw: engine.kw?.toString() || "",
    kraftstoff: engine.fuel || "",
    getriebe: ad.transmission || "",

    beschreibung: ad.description || "",
    beschreibung_kurz: ad.description_plain || "",

    kilometer: vehicle.mileage?.toString() || "",
    baujahr: ad.model_year?.toString() || "",
    preis: ad.price?.toString() || "",

    breite: dims.width?.toString() || "",
    hoehe: dims.height?.toString() || "",
    laenge: dims.length?.toString() || "",

    geraet_id: ad.id?.toString() || "",

    hauptbild: ad.media?.[0]?.url || "",
    galerie: ad.media?.map(img => img.url) || []
  };
}
