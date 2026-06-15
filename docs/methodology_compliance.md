# ParkWatch Methodology and Compliance

## System overview

ParkWatch is an official-data-only analytics prototype. The offline preprocessing
pipeline reads the local official parking violation CSV, creates hotspot and graph
features, computes an Obstruction Risk Score, creates a simple forecast of future
observed violations, and writes JSON outputs. The FastAPI backend serves only
those precomputed JSON files. The Next.js frontend renders the dashboard,
hotspot detail, temporal heatmap, graph neighborhood, forecast, and methodology
views.

## Dataset fields used

- `latitude`
- `longitude`
- `location`
- `violation_type`
- `created_datetime`
- `device_id`
- `police_station`
- `junction_name`
- `validation_status`

## Why external data is not used

The current project constraint is official dataset only. ParkWatch does not use
OSM, weather, traffic speed, map tiles, road-network data, or external datasets
in code, preprocessing, scoring, forecasting, or API responses. This keeps the
prototype auditable and avoids unsupported claims about measured congestion.

## Grid graph

Each violation coordinate is assigned to a 0.001-degree grid cell. Each grid cell
is a graph node. Edges are built only from dataset coordinates using haversine
distance between representative cell coordinates. Cells are connected when they
fall within the configured 300 to 500 meter distance band. Neighbor influence is
derived from adjacent grid-cell violation volume and edge weights.

## Obstruction Risk Score formula

The score is scaled from 0 to 100:

```text
0.30 * violation volume
+ 0.15 * active-day recurrence
+ 0.10 * device-day support
+ 0.20 * mean severity
+ 0.10 * junction share
+ 0.10 * graph-neighbor influence
+ 0.05 * validation share
```

Severity is derived from official violation types only. High severity includes
double parking, parking in a main road, parking near road crossing, parking near
bus stop/school/hospital etc., parking near traffic light or zebra cross, and
parking opposite another parked vehicle. Parking on footpath is Medium. All other
types are Low.

## Confidence labels

Confidence is evidence density, not proof of traffic impact:

- High: at least 25 violations, 5 active days, and 5 device-days.
- Medium: at least 8 violations and 2 active days.
- Low: all other grid cells.

## Forecast

The forecast predicts future observed parking violation counts, not measured
congestion. The baseline uses last 1-week count, last 2-week average, last
4-week average, and a small weighted graph-neighbor recent-activity term. The
last four weekly buckets are used for holdout evaluation.

## Limitations

- Patrol bias: observations reflect where enforcement or capture devices were present.
- Missing traffic speed: no speed, flow, travel-time, or queue data is present.
- No measured delay: the dataset cannot quantify actual delay.
- No violation duration: records do not say how long each obstruction persisted.
- Partial months: available months may not be complete calendar periods.
- Validation missingness: validation status is incomplete for some records.

## Future extensions

Future work may add OSM, traffic speed, weather, camera detection, STGCN-style
spatiotemporal graph models, and cost or minutes-saved analysis. Cost and
minutes-saved claims should be made only after validation against measured delay
or travel-time data.

## Compliance boundary

ParkWatch must not claim actual measured congestion reduction, minutes saved,
delay avoided, or travel-time improvement from the current official CSV alone.
