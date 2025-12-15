// pages/api/media.js
export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Missing ?id=" });
    }

    const user = process.env.SYS_API_USER;
    const pass = process.env.SYS_API_PASS;

    const url = `https://api.syscara.com/data/media/?media_id=${id}&file=path`;

    const response = await fetch(url, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "Syscara error",
        details: data,
      });
    }

    const item = data[id];

    if (!item || !item.name) {
      return res.status(500).json({
        error: "Media not found in Syscara response",
        details: data,
      });
    }

    const publicUrl = `https://api.syscara.com/data/media/${item.name}`;

    return res.status(200).json({
      ok: true,
      id,
      fileName: item.name,
      publicUrl,
    });
  } catch (e) {
    return res.status(500).json({
      error: "Internal error",
      details: e.message,
    });
  }
}

