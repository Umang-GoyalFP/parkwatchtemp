const concepts = [
  {
    name: "Hotspot",
    represents: "A 0.001-degree grid cell that aggregates observed parking violation records.",
    readAs: "A repeated observation zone, not a precise curb segment or measured traffic bottleneck."
  },
  {
    name: "Location label",
    represents: "The first readable location, cleaned junction, or station label available in the CSV.",
    readAs: "A human-friendly label for scanning. The grid cell ID remains the audit key."
  },
  {
    name: "Obstruction Risk Score",
    represents: "A 0-100 proxy from volume, recurrence, severity, junction share, validation, devices, and nearby cells.",
    readAs: "How strongly the official records suggest possible carriageway or intersection obstruction risk."
  },
  {
    name: "Enforcement Priority Score",
    represents: "An action score using obstruction risk plus station-normalized volume, recency, trend, peak concentration, graph influence, confidence, and stability.",
    readAs: "Where targeted enforcement should be considered first under the current data-only evidence."
  },
  {
    name: "Confidence",
    represents: "Evidence density from violation count, active days, and device-days.",
    readAs: "How much repeated support exists for the hotspot, not proof of traffic impact."
  },
  {
    name: "Temporal heatmap",
    represents: "Observed violation counts by weekday and hour.",
    readAs: "When enforcement may be most relevant, based on observed records."
  },
  {
    name: "Graph neighborhood",
    represents: "Nearby grid cells connected only by dataset coordinates and haversine distance.",
    readAs: "Spatial spillover context, not a road network or traffic-flow graph."
  },
  {
    name: "Forecast",
    represents: "Next-week future observed parking violation counts and priority, with a prediction range.",
    readAs: "A planning forecast for likely observed violations, not a congestion forecast."
  }
];

const canSay = [
  "This zone has repeated observed violations and a high obstruction-risk proxy.",
  "This station has hotspots that are high priority within the official records.",
  "This weekday-hour window has more observed violations than other windows.",
  "This forecast expects a range of future observed parking violations."
];

const cannotSay = [
  "This caused a measured number of minutes of delay.",
  "This is a measured congestion hotspot.",
  "Enforcement here will reduce congestion by a specific percentage.",
  "The graph proves road-network traffic spillover."
];

export default function ExplainerPage() {
  return (
    <main className="page-shell explainer-page">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Representation explainer</p>
          <h1>How to read ParkWatch outputs.</h1>
          <p>
            ParkWatch represents official parking violation observations as hotspot,
            time, graph, score, priority, and forecast views. These are decision-support
            proxies, not measured congestion, speed, delay, or travel-time effects.
          </p>
        </div>
      </section>

      <section className="explainer-grid" aria-label="Dashboard representation concepts">
        {concepts.map((concept) => (
          <article className="panel explainer-card" key={concept.name}>
            <p className="eyebrow">{concept.name}</p>
            <h2>What it represents</h2>
            <p>{concept.represents}</p>
            <h3>How to read it</h3>
            <p>{concept.readAs}</p>
          </article>
        ))}
      </section>

      <section className="claim-grid" aria-label="Claims boundary">
        <article className="panel">
          <p className="eyebrow">Supported wording</p>
          <h2>Can say</h2>
          <ul className="method-list">
            {canSay.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <p className="eyebrow">Unsupported wording</p>
          <h2>Cannot say</h2>
          <ul className="method-list">
            {cannotSay.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
