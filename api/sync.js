import { runDeltaSync } from "../libs/sync.js";

export default async function handler(req, res) {
  try {
    console.log("🔄 Running FULL SYNC request…");

    const user = process.env.SYS_API_USER;
    const pass = process.env.SYS_API_PASS;

    if (!user || !pass) {
      return res.status(500).json({
        error: "Missing Syscara API credentials",
      });
    }

    // Syscara Base URL
    const BASE = "https://api.syscara.com";

    // Fetch all ads
    const url = `${BASE}/sale/ads/`;

    const response = await fetch(url, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error("Syscara API error: " + txt);
    }

    const syscaraData = await response.json();

    if (!syscaraData || typeof syscaraData !== "object") {
      throw new Error("Unexpected Syscara response structure");
    }

    console.log(`📦 Syscara returned ${Object.keys(syscaraData).length} vehicles`);

    // Run Delta Sync
    await runDeltaSync(syscaraData);

    console.log("🎉 SYNC COMPLETED SUCCESSFULLY");

    return res.status(200).json({
      status: "ok",
      synced: Object.keys(syscaraData).length,
    });

  } catch (error) {
    console.error("❌ SYNC FAILED:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
}
