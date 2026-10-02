import { get, put, putMany } from "./db.js";
import { summarize } from "../modules/stats.js";

const SEED_VERSION = "demo-v1";
const patterns = {
  "lot-01-a": [5.0, 5.2, 5.3, 5.4],
  "lot-01-b": [5.8, 5.9, 5.8, 5.85],
  "lot-01-c": [5.5, 5.4, 5.2, 5.1]
};
const deltas = [-0.22, -0.12, -0.08, -0.03, 0, 0.02, 0.05, 0.09, 0.14, 0.21];

function historicalRecords(data) {
  const sessions = [];
  const measurements = [];
  const lotIds = Object.keys(patterns);
  lotIds.forEach((lotId, lotIndex) => {
    data.campaigns.forEach((campaign, campaignIndex) => {
      const medianBase = patterns[lotId][campaignIndex];
      const sessionId = `hist-${lotId}-${campaign.id}`;
      const date = `${campaign.date}T14:00:00.000Z`;
      const points = deltas.map((delta, pointIndex) => {
        const latitude = 1.8002 + lotIndex * 0.006 + pointIndex * 0.00019;
        const longitude = -76.0504 - lotIndex * 0.005 - ((pointIndex * 3) % 10) * 0.00016;
        return {
          id: `${sessionId}-m${pointIndex + 1}`,
          session_id: sessionId,
          sample_number: pointIndex + 1,
          ph: Number((medianBase + delta).toFixed(2)),
          temperature_c: Number((20.5 + pointIndex * 0.25).toFixed(1)),
          latitude,
          longitude,
          gps_accuracy_m: 7 + (pointIndex % 4),
          source: "demo",
          captured_at: new Date(Date.parse(date) + pointIndex * 60000).toISOString(),
          sync_status: "synced-demo"
        };
      });
      const stats = summarize(points.map(point => point.ph));
      sessions.push({
        id: sessionId,
        technician_id: "tech-co-01",
        country_id: "co",
        farm_id: "farm-01",
        lot_id: lotId,
        campaign_id: campaign.id,
        crop: "coffee",
        target_samples: 10,
        status: "completed",
        started_at: date,
        completed_at: new Date(Date.parse(date) + 10 * 60000).toISOString(),
        updated_at: date,
        sync_status: "synced-demo",
        summary: stats,
        demo: true
      });
      measurements.push(...points);
    });
  });
  return { sessions, measurements };
}

export async function seedDemoData() {
  const seeded = await get("meta", "seed-version");
  const response = await fetch(new URL("../../../config/demo-data.json", import.meta.url));
  if (!response.ok) throw new Error("No fue posible cargar los datos ficticios");
  const data = await response.json();
  if (seeded?.value === SEED_VERSION) return data;
  await putMany("technicians", data.technicians);
  await putMany("farms", data.farms);
  await putMany("lots", data.lots);
  await putMany("campaigns", data.campaigns);
  const history = historicalRecords(data);
  await putMany("sessions", history.sessions);
  await putMany("measurements", history.measurements);
  await put("meta", { id: "seed-version", value: SEED_VERSION, seeded_at: new Date().toISOString() });
  return data;
}
