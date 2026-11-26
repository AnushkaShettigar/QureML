import React from "react";

export default function RiskHistoryChart({ patients, onSelect }) {
  const [hoverIdx, setHoverIdx] = React.useState(null);

  const history = patients.slice(0, 8).reverse();
  const W = 280;
  const H = 100;

  if (history.length === 0) {
    return <p className="sub-text">No predictions yet — run one to see your trend.</p>;
  }

  const points = history.map((p, i) => {
    const x = history.length > 1 ? (i / (history.length - 1)) * W : W / 2;
    const y = H - 8 - (Math.max(0, Math.min(100, p.riskScore || 0)) / 100) * (H - 16);
    return { x, y, patient: p };
  });

  const linePath = points.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const areaPath =
    `M ${points[0].x},${H} ` +
    points.map((pt) => `L ${pt.x},${pt.y}`).join(" ") +
    ` L ${points[points.length - 1].x},${H} Z`;

  const dotColor = (priority) => {
    if (priority === "High") return "var(--hiq-danger)";
    if (priority === "Moderate") return "var(--hiq-warning)";
    if (priority === "Low") return "var(--hiq-success)";
    return "var(--hiq-blue)";
  };

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="risk-history-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="risk-history-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="riskHistoryFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--hiq-blue)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--hiq-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1="0" y1={H - 8} x2={W} y2={H - 8} stroke="var(--hiq-border)" strokeWidth="1" />

        <path className="risk-area" d={areaPath} fill="url(#riskHistoryFill)" stroke="none" />
        <polyline
          className="risk-line"
          pathLength="1"
          points={linePath}
          fill="none"
          stroke="var(--hiq-blue)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((pt, i) => (
          <g
            key={pt.patient.id || i}
            className="risk-point"
            tabIndex={0}
            role="button"
            aria-label={`${pt.patient.patientName || pt.patient.name || "Assessment"}: ${pt.patient.riskScore}% risk, ${pt.patient.priority} priority. View report.`}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
            onFocus={() => setHoverIdx(i)}
            onBlur={() => setHoverIdx((cur) => (cur === i ? null : cur))}
            onClick={() => onSelect(pt.patient)}
          >
            <circle className="risk-point-hit" cx={pt.x} cy={pt.y} r="11" />
            <circle
              className="risk-point-dot"
              style={{ "--i": i }}
              cx={pt.x}
              cy={pt.y}
              r={hoverIdx === i ? 6.5 : 3.5}
              fill={dotColor(pt.patient.priority)}
              stroke="var(--hiq-card)"
              strokeWidth="1.5"
            />
          </g>
        ))}
      </svg>

      {hovered && (
        <div
          className="risk-history-tooltip"
          style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100}%` }}
        >
          <strong>{hovered.patient.patientName || hovered.patient.name || "Assessment"}</strong>
          <span className="rht-sub">{hovered.patient.id}</span>
          <span className="rht-score" style={{ color: dotColor(hovered.patient.priority) }}>
            {hovered.patient.riskScore}% · {hovered.patient.priority}
          </span>
        </div>
      )}

      <p className="risk-history-hint">Hover a point for details · click to open the report</p>
    </div>
  );
}
