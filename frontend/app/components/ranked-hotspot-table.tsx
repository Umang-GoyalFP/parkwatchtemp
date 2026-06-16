import type { Hotspot } from "../lib/types";
import { hotspotContext, hotspotName } from "../lib/hotspot-labels";

type RankedHotspotTableProps = {
  hotspots: Hotspot[];
  selectedCellId: string | null;
  onSelect: (cellId: string) => void;
};

export function RankedHotspotTable({
  hotspots,
  selectedCellId,
  onSelect
}: RankedHotspotTableProps) {
  const topRows = hotspots.slice(0, 40);
  const selectedHotspot =
    hotspots.find((hotspot) => hotspot.grid_cell_id === selectedCellId) ?? null;
  const rows =
    selectedHotspot && !topRows.some((hotspot) => hotspot.grid_cell_id === selectedHotspot.grid_cell_id)
      ? [...topRows, selectedHotspot]
      : topRows;

  return (
    <section className="panel table-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Ranked hotspots</p>
          <h2>Enforcement priority zones</h2>
        </div>
        <span className="pill">{hotspots.length} shown</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Station</th>
              <th>Priority score</th>
              <th>Risk score</th>
              <th>Violations</th>
              <th>Peak window</th>
              <th>Priority</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((hotspot) => (
              <tr
                key={hotspot.grid_cell_id}
                className={hotspot.grid_cell_id === selectedCellId ? "active-row" : ""}
                onClick={() => onSelect(hotspot.grid_cell_id)}
              >
                <td>
                  <strong className="location-name">{hotspotName(hotspot)}</strong>
                  <span className="cell-meta">{hotspotContext(hotspot)}</span>
                </td>
                <td>{hotspot.dominant_station ?? "Unknown"}</td>
                <td>{hotspot.enforcement_priority_score.toFixed(1)}</td>
                <td>{hotspot.obstruction_risk_score.toFixed(1)}</td>
                <td>{hotspot.violation_count.toLocaleString("en-IN")}</td>
                <td>{formatPeakWindow(hotspot)}</td>
                <td>
                  <span className={`priority ${priorityClass(hotspot)}`}>
                    {priorityLabel(hotspot)}
                  </span>
                </td>
                <td>
                  <span className={`confidence ${hotspot.confidence.toLowerCase()}`}>
                    {hotspot.confidence}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatPeakWindow(hotspot: Hotspot) {
  const weekday = hotspot.peak_weekday ?? "Unknown";
  const hour =
    hotspot.peak_hour === null
      ? "unknown hour"
      : `${hotspot.peak_hour.toString().padStart(2, "0")}:00`;
  return `${weekday}, ${hour}`;
}

function priorityLabel(hotspot: Hotspot) {
  return hotspot.priority_band;
}

function priorityClass(hotspot: Hotspot) {
  if (hotspot.priority_band === "Deploy first") {
    return "first";
  }
  if (hotspot.priority_band === "Schedule patrol") {
    return "schedule";
  }
  return "monitor";
}
