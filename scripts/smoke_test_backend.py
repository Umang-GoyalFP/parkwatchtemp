from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app


def main() -> None:
    client = TestClient(app)

    health = client.get("/api/health")
    health.raise_for_status()
    assert health.json()["data_ready"] is True

    summary = client.get("/api/summary")
    summary.raise_for_status()
    summary_payload = summary.json()
    assert summary_payload["hotspot_count"] > 0
    assert summary_payload["edge_count"] > 0
    assert "congestion-risk proxy" in summary_payload["score_note"]

    hotspots = client.get("/api/hotspots?limit=3")
    hotspots.raise_for_status()
    hotspot_payload = hotspots.json()
    assert len(hotspot_payload) == 3
    cell_id = hotspot_payload[0]["grid_cell_id"]

    endpoints = [
        f"/api/hotspots/{cell_id}",
        f"/api/timeseries/{cell_id}",
        "/api/stations",
        "/api/temporal/hourly",
        "/api/temporal/weekday",
        "/api/temporal/heatmap",
        "/api/forecast",
        f"/api/graph/{cell_id}",
    ]
    for endpoint in endpoints:
        response = client.get(endpoint)
        response.raise_for_status()
        assert response.json()

    missing = client.get("/api/hotspots/not-a-cell")
    assert missing.status_code == 404

    print("Backend smoke test passed.")
    print(f"Hotspots: {summary_payload['hotspot_count']}")
    print(f"Graph edges: {summary_payload['edge_count']}")
    print(f"Sample cell: {cell_id}")


if __name__ == "__main__":
    main()
