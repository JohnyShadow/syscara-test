import { mapVehicle } from "../libs/map.js";

export default function handler(req, res) {
  try {
    const sample = {
      id: 135965,
      producer: "Dethleffs",
      series: "Just 90",
      model: "T 6752 DBL",
      model_add: "/Jubiläumsausstattung",
      condition: "NEW",
      type: "Reisemobil",
      category: "Sale",
      hp: 165,
      kw: 121,
      description_plain: "Beschreibung Beispiel",
      description_short: "Kurzbeschreibung Beispiel",
      mileage: 12000,
      model_year: 2023,
      price: 72900,
      dimensions: { width: 233, height: 294, length: 696 },
      media: [
        { image: "https://example.com/1.jpg" },
        { image: "https://example.com/2.jpg" }
      ]
    };

    const mapped = mapVehicle(sample);

    return res.status(200).json(mapped);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
