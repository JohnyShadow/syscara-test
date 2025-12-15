/**
 * Mapping-Funktion: Syscara → Webflow CMS
 */

export function mapSyscaraAdToWebflow(ad) {
  if (!ad) return null;

  // Hersteller, Serie, Modell sauber auslesen
  const producer = ad.model?.producer || "";
  const series = ad.model?.series || "";
  const model = ad.model?.model || "";
  const model_add = ad.model?.model_add || "";

  // Vollständige Modellbezeichnung
  const fullModelName = [producer, series, model].filter(Boolean).join(" ");

  // Slug bauen
  const slug =
    `${producer}-${series}-${model}-${ad.id}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  // Fahrzeugtyp korrekt mappen
  const fahrzeugtyp =
    ad.type === "Reisemobil" || ad.type === "Caravan"
      ? ad.type
      : ad.type || "";

  // Miete oder Kauf bestimmen
  const vermietung =
    (Array.isArray(ad.flags) && ad.flags.includes("RENTAL_CAR")) ||
    (ad.location?.name &&
      ad.location.name.toLowerCase().includes("vermiet"));

  const verkauf_miete = vermietung ? "Miete" : "Kauf";

  // Bilder extrahieren (max. 25)
  const allImages = Array.isArray(ad.media)
    ? ad.media.filter((m) => m.group === "image").map((i) => i.id)
    : [];

  const hauptbild = allImages.length > 0 ? allImages[0] : "";
  const galerie = allImages.slice(0, 25);

  // Kurzbeschreibung
  const beschreibung_kurz =
    ad.texts?.description_plain?.substring(0, 300) || "";

  return {
    originalId: ad.id,

    // Webflow-Felder:
    name: fullModelName,
    slug,
    hersteller: producer,
    serie: series,
    modell: model,
    modell_zusatz: model_add,
    zustand: ad.condition || "",
    fahrzeugart: ad.model?.model_add || "",
    fahrzeugtyp,
    ps: ad.engine?.ps?.toString() || "",
    kw: ad.engine?.kw?.toString() || "",
    kraftstoff: ad.engine?.fuel || "",
    getriebe: ad.engine?.gear || "",
    beschreibung: ad.texts?.description_plain || "",
    beschreibung_kurz,
    kilometer: ad.mileage?.toString() || "",
    baujahr: ad.model?.modelyear?.toString() || "",
    preis: ad.prices?.offer?.toString() || "",
    breite: ad.dimensions?.width?.toString() || "",
    hoehe: ad.dimensions?.height?.toString() || "",
    laenge: ad.dimensions?.length?.toString() || "",
    geraet_id: ad.id.toString(),

    verkauf_miete, // <-- NEUES FELD

    hauptbild,
    galerie
  };
}
