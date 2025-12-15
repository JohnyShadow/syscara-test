export default async function handler(req, res) {
  const user = process.env.SYS_API_USER;
  const pass = process.env.SYS_API_PASS;

  const url = "https://api.syscara.com/sale/ads/135965";

  const response = await fetch(url, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  return res.status(200).json(data);
}
