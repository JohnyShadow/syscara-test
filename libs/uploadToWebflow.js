// libs/uploadToWebflow.js

export async function uploadImageToWebflow({ fileBase64, fileName }) {
  const token = process.env.WEBFLOW_TOKEN;
  if (!token) throw new Error("Missing WEBFLOW_TOKEN");

  // Base64 in Blob umwandeln
  const buffer = Buffer.from(fileBase64, "base64");

  // multipart/form-data bauen
  const form = new FormData();
  form.append("file", new Blob([buffer]), fileName);

  // Webflow Upload-API (neu, v2)
  const uploadUrl = "https://api.webflow.com/v2/uploads/images";

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    body: form
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("❌ Webflow Upload ERROR:", data);
    throw new Error("Webflow Upload failed");
  }

  // Webflow gibt eine URL zurück
  return data.url;
}
