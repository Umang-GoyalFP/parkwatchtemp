"""Offline preprocessing for the ParkWatch official parking violations CSV.

This script uses only the official CSV in data/. It does not call external
services or load any non-official datasets. The generated score is an
obstruction/congestion-risk proxy, not measured congestion.
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


try:
    KOLKATA = ZoneInfo("Asia/Kolkata")
except Exception:
    KOLKATA = timezone(timedelta(hours=5, minutes=30), name="Asia/Kolkata")
GRID_SIZE_DEGREES = 0.001
DEFAULT_MIN_EDGE_METERS = 300.0
DEFAULT_MAX_EDGE_METERS = 500.0

HIGH_SEVERITY = {
    "DOUBLE PARKING",
    "PARKING IN A MAIN ROAD",
    "PARKING NEAR ROAD CROSSING",
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC",
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS",
    "PARKING OPPOSITE TO ANOTHER PARKED VEHICLE",
}
MEDIUM_SEVERITY = {"PARKING ON FOOTPATH"}

SEVERITY_SCORE = {"Low": 1.0, "Medium": 2.0, "High": 3.0}


@dataclass
class CellAggregate:
    grid_cell_id: str
    grid_lat_index: int
    grid_lon_index: int
    violation_count: int = 0
    severity_sum: float = 0.0
    high_count: int = 0
    medium_count: int = 0
    approved_count: int = 0
    validated_count: int = 0
    junction_count: int = 0
    lat_sum: float = 0.0
    lon_sum: float = 0.0
    active_days: set[str] = field(default_factory=set)
    active_weeks: set[str] = field(default_factory=set)
    active_months: set[str] = field(default_factory=set)
    device_days: set[str] = field(default_factory=set)
    week_counts: Counter[str] = field(default_factory=Counter)
    day_counts: Counter[str] = field(default_factory=Counter)
    hour_counts: Counter[int] = field(default_factory=Counter)
    weekday_counts: Counter[str] = field(default_factory=Counter)
    weekday_hour_counts: Counter[tuple[str, int]] = field(default_factory=Counter)
    month_counts: Counter[str] = field(default_factory=Counter)
    station_counts: Counter[str] = field(default_factory=Counter)
    junction_counts: Counter[str] = field(default_factory=Counter)
    location_counts: Counter[str] = field(default_factory=Counter)
    violation_type_counts: Counter[str] = field(default_factory=Counter)
    neighbor_influence: float = 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Precompute ParkWatch hotspot JSON from the official CSV."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Path to the official parking violation CSV. Defaults to the only CSV in data/.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("backend/app/data/processed"),
        help="Directory for generated backend JSON outputs.",
    )
    parser.add_argument(
        "--min-edge-meters",
        type=float,
        default=DEFAULT_MIN_EDGE_METERS,
        help="Minimum distance for graph edges between grid cells.",
    )
    parser.add_argument(
        "--max-edge-meters",
        type=float,
        default=DEFAULT_MAX_EDGE_METERS,
        help="Maximum distance for graph edges between grid cells.",
    )
    return parser.parse_args()


def find_official_csv() -> Path:
    csv_files = sorted(Path("data").glob("*.csv"))
    if len(csv_files) != 1:
        raise SystemExit(
            "Expected exactly one official CSV in data/. "
            f"Found {len(csv_files)}: {[str(path) for path in csv_files]}"
        )
    return csv_files[0]


def parse_datetime_to_kolkata(value: str) -> datetime | None:
    if not value or value.upper() == "NULL":
        return None
    normalized = value.strip()
    if normalized.endswith("+00"):
        normalized = normalized[:-3] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(KOLKATA)


def parse_violation_types(value: str) -> list[str]:
    if not value or value.upper() == "NULL":
        return []
    parsed: Any
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        try:
            parsed = ast.literal_eval(value)
        except (SyntaxError, ValueError):
            parsed = [value]
    if isinstance(parsed, str):
        parsed = [parsed]
    if not isinstance(parsed, list):
        return []
    return [str(item).strip().upper() for item in parsed if str(item).strip()]


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text or text.upper() == "NULL":
        return None
    return text


def is_true(value: str | None) -> bool:
    return bool(value and value.strip().upper() == "TRUE")


def severity_for(violation_types: list[str]) -> str:
    if any(item in HIGH_SEVERITY for item in violation_types):
        return "High"
    if any(item in MEDIUM_SEVERITY for item in violation_types):
        return "Medium"
    return "Low"


def grid_indices(latitude: float, longitude: float) -> tuple[int, int]:
    return (
        math.floor(latitude / GRID_SIZE_DEGREES),
        math.floor(longitude / GRID_SIZE_DEGREES),
    )


def grid_cell_id(lat_index: int, lon_index: int) -> str:
    return f"{lat_index}_{lon_index}"


def haversine_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    radius_meters = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    return radius_meters * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def dominant(counter: Counter[Any], default: Any = None) -> Any:
    if not counter:
        return default
    return counter.most_common(1)[0][0]


def read_and_aggregate(csv_path: Path) -> tuple[dict[str, CellAggregate], int, int]:
    cells: dict[str, CellAggregate] = {}
    skipped_rows = 0
    total_rows = 0

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            total_rows += 1
            try:
                latitude = float(row.get("latitude", ""))
                longitude = float(row.get("longitude", ""))
            except ValueError:
                skipped_rows += 1
                continue

            created_at = parse_datetime_to_kolkata(row.get("created_datetime", ""))
            if created_at is None:
                skipped_rows += 1
                continue

            lat_index, lon_index = grid_indices(latitude, longitude)
            cell_id = grid_cell_id(lat_index, lon_index)
            cell = cells.setdefault(
                cell_id,
                CellAggregate(
                    grid_cell_id=cell_id,
                    grid_lat_index=lat_index,
                    grid_lon_index=lon_index,
                ),
            )

            violation_types = parse_violation_types(row.get("violation_type", ""))
            severity = severity_for(violation_types)
            severity_score = SEVERITY_SCORE[severity]
            weekday = created_at.strftime("%A")
            iso_year, iso_week, _ = created_at.isocalendar()
            week = f"{iso_year}-W{iso_week:02d}"
            month = created_at.strftime("%Y-%m")
            day = created_at.date().isoformat()
            device_id = clean_text(row.get("device_id")) or "unknown_device"
            status = (clean_text(row.get("validation_status")) or "").lower()
            junction = clean_text(row.get("junction_name"))

            cell.violation_count += 1
            cell.severity_sum += severity_score
            cell.high_count += int(severity == "High")
            cell.medium_count += int(severity == "Medium")
            cell.lat_sum += latitude
            cell.lon_sum += longitude
            cell.active_days.add(day)
            cell.active_weeks.add(week)
            cell.active_months.add(month)
            cell.device_days.add(f"{device_id}|{day}")
            cell.week_counts[week] += 1
            cell.day_counts[day] += 1
            cell.hour_counts[created_at.hour] += 1
            cell.weekday_counts[weekday] += 1
            cell.weekday_hour_counts[(weekday, created_at.hour)] += 1
            cell.month_counts[month] += 1

            if status == "approved":
                cell.approved_count += 1
            if status:
                cell.validated_count += 1
            if junction and junction.lower() != "no junction":
                cell.junction_count += 1
                cell.junction_counts[junction] += 1
            elif junction:
                cell.junction_counts[junction] += 1

            station = clean_text(row.get("police_station"))
            location = clean_text(row.get("location"))
            if station:
                cell.station_counts[station] += 1
            if location:
                cell.location_counts[location] += 1
            for violation_type in violation_types:
                cell.violation_type_counts[violation_type] += 1

    return cells, total_rows, skipped_rows


def build_edges(
    cells: dict[str, CellAggregate], min_meters: float, max_meters: float
) -> list[dict[str, Any]]:
    by_index = {
        (cell.grid_lat_index, cell.grid_lon_index): cell
        for cell in cells.values()
    }
    edges: list[dict[str, Any]] = []
    max_offset = max(1, math.ceil(max_meters / 111.0))

    for cell in cells.values():
        source_lat = cell.lat_sum / cell.violation_count
        source_lon = cell.lon_sum / cell.violation_count
        for d_lat in range(-max_offset, max_offset + 1):
            for d_lon in range(-max_offset, max_offset + 1):
                if d_lat == 0 and d_lon == 0:
                    continue
                neighbor = by_index.get(
                    (cell.grid_lat_index + d_lat, cell.grid_lon_index + d_lon)
                )
                if neighbor is None or cell.grid_cell_id >= neighbor.grid_cell_id:
                    continue
                target_lat = neighbor.lat_sum / neighbor.violation_count
                target_lon = neighbor.lon_sum / neighbor.violation_count
                distance = haversine_meters(
                    source_lat, source_lon, target_lat, target_lon
                )
                if min_meters <= distance <= max_meters:
                    weight = 1.0 - ((distance - min_meters) / (max_meters - min_meters))
                    edge = {
                        "source": cell.grid_cell_id,
                        "target": neighbor.grid_cell_id,
                        "distance_meters": round(distance, 2),
                        "weight": round(weight, 4),
                    }
                    edges.append(edge)
                    cell.neighbor_influence += neighbor.violation_count * weight
                    neighbor.neighbor_influence += cell.violation_count * weight

    return edges


def scale(value: float, maximum: float) -> float:
    if maximum <= 0:
        return 0.0
    return min(value / maximum, 1.0)


def confidence_label(count: int, active_days: int, device_days: int) -> str:
    if count >= 25 and active_days >= 5 and device_days >= 5:
        return "High"
    if count >= 8 and active_days >= 2:
        return "Medium"
    return "Low"


def reason_codes(
    cell: CellAggregate,
    risk_score: float,
    max_count: int,
    max_neighbor_influence: float,
) -> list[str]:
    codes: list[str] = []
    peak_count = max(cell.hour_counts.values(), default=0)
    if scale(cell.violation_count, max_count) >= 0.7:
        codes.append("HIGH_VIOLATION_VOLUME")
    if cell.high_count / cell.violation_count >= 0.35:
        codes.append("HIGH_SEVERITY_MIX")
    if cell.junction_count / cell.violation_count >= 0.25:
        codes.append("JUNCTION_PROXIMITY")
    if peak_count / cell.violation_count >= 0.3:
        codes.append("PEAK_TIME_CONCENTRATION")
    if len(cell.active_days) >= 5 or len(cell.active_weeks) >= 3:
        codes.append("REPEATED_ACTIVITY")
    if cell.validated_count / cell.violation_count >= 0.5:
        codes.append("VALIDATED_REPORTS")
    if scale(cell.neighbor_influence, max_neighbor_influence) >= 0.6:
        codes.append("NEIGHBOR_HOTSPOT_INFLUENCE")
    if risk_score >= 75 and not codes:
        codes.append("ELEVATED_OBSTRUCTION_RISK_PROXY")
    return codes or ["LIMITED_EVIDENCE"]


def serialize_hotspots(cells: dict[str, CellAggregate]) -> list[dict[str, Any]]:
    max_count = max((cell.violation_count for cell in cells.values()), default=0)
    max_active_days = max((len(cell.active_days) for cell in cells.values()), default=0)
    max_device_days = max((len(cell.device_days) for cell in cells.values()), default=0)
    max_neighbor_influence = max(
        (cell.neighbor_influence for cell in cells.values()), default=0.0
    )

    hotspots: list[dict[str, Any]] = []
    for cell in cells.values():
        count_component = scale(cell.violation_count, max_count)
        day_component = scale(len(cell.active_days), max_active_days)
        device_component = scale(len(cell.device_days), max_device_days)
        severity_component = (cell.severity_sum / cell.violation_count - 1.0) / 2.0
        junction_component = cell.junction_count / cell.violation_count
        validation_component = cell.validated_count / cell.violation_count
        neighbor_component = scale(cell.neighbor_influence, max_neighbor_influence)
        risk_score = round(
            100.0
            * (
                0.30 * count_component
                + 0.15 * day_component
                + 0.10 * device_component
                + 0.20 * severity_component
                + 0.10 * junction_component
                + 0.10 * neighbor_component
                + 0.05 * validation_component
            ),
            2,
        )

        hotspots.append(
            {
                "grid_cell_id": cell.grid_cell_id,
                "grid": {
                    "size_degrees": GRID_SIZE_DEGREES,
                    "lat_index": cell.grid_lat_index,
                    "lon_index": cell.grid_lon_index,
                },
                "latitude": round(cell.lat_sum / cell.violation_count, 7),
                "longitude": round(cell.lon_sum / cell.violation_count, 7),
                "violation_count": cell.violation_count,
                "active_days": len(cell.active_days),
                "active_weeks": len(cell.active_weeks),
                "active_months": len(cell.active_months),
                "device_days": len(cell.device_days),
                "mean_severity": round(cell.severity_sum / cell.violation_count, 4),
                "junction_share": round(cell.junction_count / cell.violation_count, 4),
                "approved_count": cell.approved_count,
                "validated_count": cell.validated_count,
                "dominant_station": dominant(cell.station_counts),
                "dominant_junction": dominant(cell.junction_counts),
                "representative_location": dominant(cell.location_counts),
                "peak_hour": dominant(cell.hour_counts),
                "peak_weekday": dominant(cell.weekday_counts),
                "peak_month": dominant(cell.month_counts),
                "dominant_violation_type": dominant(cell.violation_type_counts),
                "neighbor_influence": round(cell.neighbor_influence, 4),
                "obstruction_risk_score": risk_score,
                "risk_score_type": "congestion-risk proxy",
                "confidence": confidence_label(
                    cell.violation_count, len(cell.active_days), len(cell.device_days)
                ),
                "reason_codes": reason_codes(
                    cell, risk_score, max_count, max_neighbor_influence
                ),
            }
        )

    hotspots.sort(
        key=lambda item: (
            item["obstruction_risk_score"],
            item["violation_count"],
            item["grid_cell_id"],
        ),
        reverse=True,
    )
    return hotspots


def serialize_cell_timeseries(
    cells: dict[str, CellAggregate]
) -> dict[str, list[dict[str, Any]]]:
    return {
        cell.grid_cell_id: [
            {"date": day, "violation_count": count}
            for day, count in sorted(cell.day_counts.items())
        ]
        for cell in cells.values()
    }


def serialize_temporal(cells: dict[str, CellAggregate]) -> dict[str, Any]:
    hourly: Counter[int] = Counter()
    weekday: Counter[str] = Counter()
    heatmap: Counter[tuple[str, int]] = Counter()
    weekday_order = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ]

    for cell in cells.values():
        hourly.update(cell.hour_counts)
        weekday.update(cell.weekday_counts)
        heatmap.update(cell.weekday_hour_counts)

    return {
        "hourly": [
            {"hour": hour, "violation_count": hourly.get(hour, 0)}
            for hour in range(24)
        ],
        "weekday": [
            {"weekday": name, "violation_count": weekday.get(name, 0)}
            for name in weekday_order
        ],
        "heatmap": [
            {
                "weekday": name,
                "hour": hour,
                "violation_count": heatmap.get((name, hour), 0),
            }
            for name in weekday_order
            for hour in range(24)
        ],
    }


def serialize_weekly_timeseries(
    cells: dict[str, CellAggregate]
) -> dict[str, list[dict[str, Any]]]:
    return {
        cell.grid_cell_id: [
            {"week": week, "violation_count": count}
            for week, count in sorted(cell.week_counts.items())
        ]
        for cell in cells.values()
    }


def build_edge_lookup(edges: list[dict[str, Any]]) -> dict[str, list[tuple[str, float]]]:
    lookup: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for edge in edges:
        lookup[edge["source"]].append((edge["target"], float(edge["weight"])))
        lookup[edge["target"]].append((edge["source"], float(edge["weight"])))
    return lookup


def predict_week_count(
    cell_id: str,
    weeks: list[str],
    counts_by_cell: dict[str, Counter[str]],
    edge_lookup: dict[str, list[tuple[str, float]]],
) -> float:
    counts = counts_by_cell[cell_id]
    last1 = counts.get(weeks[-1], 0) if len(weeks) >= 1 else 0
    last2 = sum(counts.get(week, 0) for week in weeks[-2:]) / min(len(weeks), 2)
    last4 = sum(counts.get(week, 0) for week in weeks[-4:]) / min(len(weeks), 4)

    weighted_neighbor_sum = 0.0
    weight_sum = 0.0
    for neighbor_id, weight in edge_lookup.get(cell_id, []):
        neighbor_counts = counts_by_cell.get(neighbor_id, Counter())
        neighbor_last4 = sum(neighbor_counts.get(week, 0) for week in weeks[-4:]) / min(
            len(weeks), 4
        )
        weighted_neighbor_sum += neighbor_last4 * weight
        weight_sum += weight
    neighbor_component = weighted_neighbor_sum / weight_sum if weight_sum else 0.0

    prediction = (0.45 * last1) + (0.30 * last2) + (0.20 * last4) + (
        0.05 * neighbor_component
    )
    return max(0.0, prediction)


def forecast_confidence(active_weeks: int, holdout_mae: float | None, predicted: float) -> str:
    if active_weeks >= 12 and (holdout_mae is None or holdout_mae <= max(5.0, predicted * 0.45)):
        return "High"
    if active_weeks >= 6:
        return "Medium"
    return "Low"


def next_iso_week_label(week: str) -> str:
    year_text, week_text = week.split("-W")
    year = int(year_text)
    week_number = int(week_text)
    monday = datetime.fromisocalendar(year, week_number, 1) + timedelta(days=7)
    iso_year, iso_week, _ = monday.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def serialize_forecast(
    cells: dict[str, CellAggregate],
    hotspots: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> dict[str, Any]:
    all_weeks = sorted({week for cell in cells.values() for week in cell.week_counts})
    counts_by_cell = {cell_id: cell.week_counts for cell_id, cell in cells.items()}
    edge_lookup = build_edge_lookup(edges)
    hotspot_lookup = {hotspot["grid_cell_id"]: hotspot for hotspot in hotspots}

    holdout_weeks = all_weeks[-4:] if len(all_weeks) >= 5 else []
    error_sum = 0.0
    absolute_percentage_error_sum = 0.0
    evaluated_points = 0

    for holdout_week in holdout_weeks:
        train_weeks = [week for week in all_weeks if week < holdout_week]
        if not train_weeks:
            continue
        for cell_id in counts_by_cell:
            actual = counts_by_cell[cell_id].get(holdout_week, 0)
            predicted = predict_week_count(cell_id, train_weeks, counts_by_cell, edge_lookup)
            absolute_error = abs(predicted - actual)
            error_sum += absolute_error
            if actual > 0:
                absolute_percentage_error_sum += absolute_error / actual
            evaluated_points += 1

    mae = round(error_sum / evaluated_points, 4) if evaluated_points else None
    mape = (
        round((absolute_percentage_error_sum / evaluated_points) * 100.0, 4)
        if evaluated_points
        else None
    )

    forecast_week = next_iso_week_label(all_weeks[-1]) if all_weeks else None
    max_prediction = 0.0
    raw_forecasts: list[dict[str, Any]] = []
    for cell_id, cell in cells.items():
        hotspot = hotspot_lookup[cell_id]
        predicted_count = predict_week_count(cell_id, all_weeks, counts_by_cell, edge_lookup)
        max_prediction = max(max_prediction, predicted_count)
        history = [
            {"week": week, "violation_count": counts_by_cell[cell_id].get(week, 0)}
            for week in all_weeks[-12:]
        ]
        raw_forecasts.append(
            {
                "grid_cell_id": cell_id,
                "station": hotspot.get("dominant_station"),
                "junction": hotspot.get("dominant_junction"),
                "location": hotspot.get("representative_location"),
                "latitude": hotspot["latitude"],
                "longitude": hotspot["longitude"],
                "predicted_week": forecast_week,
                "predicted_violation_count": round(predicted_count, 2),
                "predicted_obstruction_risk": 0.0,
                "confidence": forecast_confidence(len(cell.active_weeks), mae, predicted_count),
                "neighbor_influence": hotspot["neighbor_influence"],
                "last_1_week_count": counts_by_cell[cell_id].get(all_weeks[-1], 0),
                "last_2_week_avg": round(
                    sum(counts_by_cell[cell_id].get(week, 0) for week in all_weeks[-2:])
                    / min(len(all_weeks), 2),
                    2,
                ),
                "last_4_week_avg": round(
                    sum(counts_by_cell[cell_id].get(week, 0) for week in all_weeks[-4:])
                    / min(len(all_weeks), 4),
                    2,
                ),
                "historical_weeks": history,
                "reason_codes": [
                    "RECENT_WEEKLY_BASELINE",
                    "GRAPH_NEIGHBOR_INFLUENCE",
                    "FORECAST_OF_OBSERVED_VIOLATIONS",
                ],
            }
        )

    for item in raw_forecasts:
        item["predicted_obstruction_risk"] = round(
            100.0 * scale(item["predicted_violation_count"], max_prediction), 2
        )

    raw_forecasts.sort(
        key=lambda item: (
            item["predicted_violation_count"],
            item["predicted_obstruction_risk"],
            item["grid_cell_id"],
        ),
        reverse=True,
    )

    return {
        "forecast_type": "future observed parking violations",
        "not_measured_congestion": True,
        "method": "Baseline next-week forecast from last 1/2/4 weekly counts plus weighted graph-neighbor recent activity.",
        "forecast_week": forecast_week,
        "holdout": {
            "weeks": holdout_weeks,
            "mae": mae,
            "mape": mape,
            "evaluated_points": evaluated_points,
        },
        "items": raw_forecasts,
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def main() -> None:
    args = parse_args()
    csv_path = args.input or find_official_csv()
    if not csv_path.exists():
        raise SystemExit(f"CSV not found: {csv_path}")
    if args.min_edge_meters >= args.max_edge_meters:
        raise SystemExit("--min-edge-meters must be less than --max-edge-meters")

    cells, total_rows, skipped_rows = read_and_aggregate(csv_path)
    edges = build_edges(cells, args.min_edge_meters, args.max_edge_meters)
    hotspots = serialize_hotspots(cells)
    cell_timeseries = serialize_cell_timeseries(cells)
    weekly_timeseries = serialize_weekly_timeseries(cells)
    temporal = serialize_temporal(cells)
    forecast = serialize_forecast(cells, hotspots, edges)

    metadata = {
        "source_csv": str(csv_path),
        "official_dataset_only": True,
        "external_datasets_used": [],
        "timezone": "Asia/Kolkata",
        "grid_size_degrees": GRID_SIZE_DEGREES,
        "edge_distance_meters": {
            "minimum": args.min_edge_meters,
            "maximum": args.max_edge_meters,
        },
        "score_name": "Obstruction Risk Score",
        "score_note": "This is a congestion-risk proxy, not measured congestion.",
        "rows_read": total_rows,
        "rows_skipped": skipped_rows,
        "hotspot_count": len(hotspots),
        "edge_count": len(edges),
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    output_dir = args.output_dir
    write_json(output_dir / "hotspots.json", hotspots)
    write_json(output_dir / "cell_timeseries.json", cell_timeseries)
    write_json(output_dir / "weekly_timeseries.json", weekly_timeseries)
    write_json(output_dir / "temporal.json", temporal)
    write_json(output_dir / "forecast.json", forecast)
    write_json(output_dir / "graph_edges.json", edges)
    write_json(
        output_dir / "graph.json",
        {
            "nodes": hotspots,
            "edges": edges,
        },
    )
    write_json(output_dir / "metadata.json", metadata)

    print(
        "Generated "
        f"{len(hotspots)} hotspots and {len(edges)} graph edges in {output_dir}"
    )


if __name__ == "__main__":
    main()
