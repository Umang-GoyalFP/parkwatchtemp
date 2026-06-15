import type { Hotspot } from "../lib/types";

type HotspotMapProps = {
  hotspots: Hotspot[];
  selectedCellId: string | null;
  onSelect: (cellId: string) => void;
};

export function HotspotMap({ hotspots, selectedCellId, onSelect }: HotspotMapProps) {
  if (!hotspots.length) {
    return (
      <section className="panel map-panel" aria-label="Hotspot map area">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Spatial view</p>
            <h2>Hotspot scatter view</h2>
          </div>
        </div>
        <div className="empty-state">No hotspots match the current filters.</div>
      </section>
    );
  }

  const latitudes = hotspots.map((item) => item.latitude);
  const longitudes = hotspots.map((item) => item.longitude);
  const counts = hotspots.map((item) => item.violation_count);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  return (
    <section className="panel map-panel" aria-label="Hotspot map area">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Spatial view</p>
          <h2>Hotspot scatter view</h2>
        </div>
        <span className="pill">{hotspots.length.toLocaleString()} grid cells</span>
      </div>

      <div className="map-canvas">
        <div className="map-gridlines" aria-hidden="true" />
        <svg className="scatter-svg" role="img" aria-label="Hotspot grid cells by latitude and longitude">
          {hotspots.map((hotspot) => {
            const cx = normalize(hotspot.longitude, minLon, maxLon);
            const cy = 100 - normalize(hotspot.latitude, minLat, maxLat);
            const radius = 4 + normalize(hotspot.violation_count, minCount, maxCount) * 14;
            const selected = hotspot.grid_cell_id === selectedCellId;

            return (
              <circle
                key={hotspot.grid_cell_id}
                className={`scatter-point ${selected ? "selected" : ""}`}
                cx={`${cx}%`}
                cy={`${cy}%`}
                r={selected ? radius + 4 : radius}
                fill={riskColor(hotspot.obstruction_risk_score)}
                opacity={selected ? 1 : 0.72}
                stroke={selected ? "#10212b" : "rgba(255,255,255,0.9)"}
                strokeWidth={selected ? 3 : 1.4}
                onClick={() => onSelect(hotspot.grid_cell_id)}
              >
                <title>
                  {`${hotspot.grid_cell_id}: ${hotspot.obstruction_risk_score} score, ${hotspot.violation_count} violations`}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>

      <div className="map-legend">
        <span>Lower score</span>
        <span className="legend-line" />
        <span>Higher score</span>
        <span className="size-note">Circle size = violation count</span>
      </div>
    </section>
  );
}

function normalize(value: number, minimum: number, maximum: number) {
  if (maximum === minimum) {
    return 50;
  }
  return ((value - minimum) / (maximum - minimum)) * 100;
}

function riskColor(score: number) {
  if (score >= 70) return "#d65f4b";
  if (score >= 55) return "#d88a17";
  if (score >= 35) return "#12a5a3";
  return "#1166a8";
}
