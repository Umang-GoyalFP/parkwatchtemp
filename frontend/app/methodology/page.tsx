const datasetFields = [
  "latitude and longitude",
  "location",
  "violation_type",
  "created_datetime",
  "device_id",
  "police_station",
  "junction_name",
  "validation_status"
];

const limitations = [
  "Patrol bias: observed violations reflect where enforcement or capture devices were present.",
  "Missing traffic speed: the dataset does not include speed, travel time, queue length, or flow.",
  "No measured delay: ParkWatch cannot estimate actual delay from the official CSV alone.",
  "No violation duration: records show observations, not how long each obstruction persisted.",
  "Partial months: the available window may include incomplete calendar coverage.",
  "Validation missingness: some rows do not have a completed validation status."
];

const futureExtensions = [
  "OSM context for road class and intersection structure.",
  "Traffic speed or travel-time feeds for measured congestion analysis.",
  "Weather data for exposure and seasonal context.",
  "Camera-based detection for duration and obstruction persistence.",
  "STGCN or related spatiotemporal graph models after stronger validation data exists.",
  "Cost or minutes-saved estimates only after validation against measured delay."
];

export default function MethodologyPage() {
  return (
    <main className="page-shell methodology-page">
      <section className="hero-band methodology-hero">
        <div>
          <p className="eyebrow">Methodology and compliance</p>
          <h1>Official-data-only obstruction risk analytics.</h1>
          <p>
            ParkWatch summarizes where observed parking violations cluster, repeat, and
            connect spatially. Outputs are Obstruction Risk Score and future observed
            violation forecasts, not measured congestion or measured delay reduction.
          </p>
        </div>
      </section>

      <section className="method-grid">
        <article className="method-section wide">
          <h2>System Overview</h2>
          <p>
            ParkWatch has three parts: an offline preprocessing pipeline, a FastAPI
            backend, and a Next.js frontend. The preprocessing script reads the official
            CSV once, converts timestamps to Asia/Kolkata, parses violation types,
            aggregates hotspot metrics, builds a grid-cell graph, computes obstruction
            risk, computes enforcement priority, forecasts future observed violations,
            and writes JSON files. The backend serves only those precomputed JSON
            outputs. The frontend renders dashboard, explainer, temporal, graph,
            forecast, and methodology views from backend endpoints.
          </p>
        </article>

        <article>
          <h2>Dataset Fields Used</h2>
          <ul className="method-list">
            {datasetFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Why External Data Is Not Used</h2>
          <p>
            The current project constraint is official dataset only. No OSM, traffic
            speed, weather, road network, map tile, or third-party operational dataset is
            used in scoring, forecasting, or API responses. This keeps the prototype
            auditable and prevents unsupported claims about measured congestion.
          </p>
        </article>

        <article>
          <h2>Grid Graph</h2>
          <p>
            Latitude and longitude are assigned to 0.001-degree grid cells. Each grid
            cell becomes a spatial node. Edges are created only between cells whose
            dataset-derived representative coordinates are within the configured
            haversine distance band of 300 to 500 meters. Neighbor influence is computed
            from connected cells and edge weights.
          </p>
        </article>

        <article>
          <h2>Confidence Labels</h2>
          <p>
            Confidence describes evidence density, not correctness of congestion impact.
            High requires at least 25 violations, 5 active days, and 5 device-days.
            Medium requires at least 8 violations and 2 active days. All other cells are
            labeled Low.
          </p>
        </article>

        <article className="method-section wide">
          <h2>Obstruction Risk Score Formula</h2>
          <p>
            The score is scaled from 0 to 100 after combining normalized hotspot
            components:
          </p>
          <pre className="formula-block">{`0.30 * violation volume
+ 0.15 * active-day recurrence
+ 0.10 * device-day support
+ 0.20 * mean severity
+ 0.10 * junction share
+ 0.10 * graph-neighbor influence
+ 0.05 * validation share`}</pre>
          <p>
            Severity is based only on official violation types. High severity includes
            double parking, main-road parking, parking near crossings, bus stops, schools,
            hospitals, traffic lights, zebra crossings, and opposite another parked
            vehicle. Parking on footpath is Medium. Other violation types are Low.
          </p>
        </article>

        <article className="method-section wide">
          <h2>Enforcement Priority Score Formula</h2>
          <p>
            The action score is scaled from 0 to 100 and combines the risk proxy with
            operational signals available in the official CSV:
          </p>
          <pre className="formula-block">{`0.28 * Obstruction Risk Score
+ 0.18 * station-normalized violation volume
+ 0.14 * recent 4-week activity
+ 0.12 * peak-hour temporal concentration
+ 0.10 * recent trend ratio
+ 0.08 * graph-neighbor influence
+ 0.06 * confidence evidence level
+ 0.04 * stability across weeks, days, and devices`}</pre>
          <p>
            This score ranks where enforcement should be considered first. It does not
            measure traffic speed, delay, or congestion reduction.
          </p>
        </article>

        <article>
          <h2>Forecast V2 Method</h2>
          <p>
            The forecast predicts next-week future observed parking violations. It uses
            last 1-week count, last 2-week average, last 4-week average, recent trend,
            station-normalized activity, graph-neighbor activity, temporal
            concentration, and stability. Rolling-origin weekly backtesting evaluates
            forecast error on observed violation counts.
          </p>
        </article>

        <article>
          <h2>Compliance Boundary</h2>
          <p>
            ParkWatch must not claim actual measured congestion reduction, minutes
            saved, travel time saved, or delay avoided from this dataset alone. Current
            outputs are decision-support proxies for where obstruction risk may deserve
            review.
          </p>
        </article>

        <article>
          <h2>Limitations</h2>
          <ul className="method-list">
            {limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Future Extensions</h2>
          <ul className="method-list">
            {futureExtensions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
