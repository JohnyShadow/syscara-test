export default async function handler(req, res) {
  const id = req.query.id;

  if (!id) {
    return res.status(400).send("Missing media ID");
  }

  try {
    const url = `https://api.syscara.com/services/Media/Download?id=${id}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).send("Failed to fetch media");
    }

    // Content-Type von Syscara übernehmen
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Bilddaten holen
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");

    return res.send(buffer);
  } catch (err) {
    console.error("Media Proxy Error:", err);
    return res.status(500).send("Internal Server Error");
  }
}
