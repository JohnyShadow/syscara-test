export default async function handler(req, res) {
  try {
    const response = await fetch(`${process.env.SYSCARA_API}/sale/ads`, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.SYSCARA_USER}:${process.env.SYSCARA_PASS}`
        ).toString("base64")}`,
      },
    });

    const data = await response.json();

    // NUR EIN FAHRZEUG ZURÜCKGEBEN → Browser stürzt nicht ab
    const firstKey = Object.keys(data)[0];
    const firstVehicle = data[firstKey];

    // Nur minimalen Test-Output zurückgeben
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      id: firstVehicle.id,
      name: firstVehicle.model?.producer + " " +
            firstVehicle.model?.series + " " +
            firstVehicle.model?.model,
      type: firstVehicle.type,
      condition: firstVehicle.condition,
      location: firstVehicle.location?.name,
      firstImageId: firstVehicle.media?.[0]?.id ?? null,
      mediaCount: firstVehicle.media?.length ?? 0
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
