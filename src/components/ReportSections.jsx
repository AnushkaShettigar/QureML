import Icon from "./Icon";

const BREAST_FIELDS = [
  ["mean_area", "Mean area"],
  ["mean_texture", "Mean texture"],
  ["worst_radius", "Worst radius"],
  ["worst_perimeter", "Worst perimeter"],
  ["mean_concave_points", "Mean concave points"],
  ["worst_concave_points", "Worst concave points"],
];

const show = (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? "—" : String(v));

function isDiabetes(p) {
  return p.diseaseType === "diabetes" || String(p.id || "").startsWith("DB-");
}

// Only the inputs that belong to this patient's disease (saved records also carry
// the unused defaults of the other disease's form, which must not be shown).
function inputRows(p) {
  if (isDiabetes(p)) {
    const h = Number(p.height_cm) / 100;
    const bmi = Number(p.weight_kg) / (h * h);
    const noInsulin = p.insulin === "" || p.insulin === null || p.insulin === undefined;
    return [
      ["Glucose (2-hour)", show(p.glucose), "mg/dL"],
      ["BMI", Number.isFinite(bmi) ? bmi.toFixed(1) : "—", "kg/m²"],
      ["Age", show(p.age), "years"],
      ["Blood pressure", show(p.blood_pressure), "mm Hg"],
      ["Insulin", noInsulin ? "Not provided" : show(p.insulin), noInsulin ? "" : "µU/mL"],
      ["Family history score", show(p.diabetes_pedigree), ""],
    ];
  }
  return BREAST_FIELDS.map(([key, label]) => [label, show(p[key]), ""]);
}

function keyFactors(p, labelMap) {
  if (!Array.isArray(p.explanation)) return [];
  return p.explanation
    .map((f) => ({
      label: (f.related_features || []).map((raw) => labelMap[raw] || raw).join(" / "),
      raises: f.direction === "raises risk",
      impact: Math.abs(f.impact || 0),
    }))
    .filter((f, i, all) => f.label && all.findIndex((t) => t.label === f.label) === i)
    .slice(0, 5);
}

export default function ReportSections({ patient, labelMap }) {
  const rows = inputRows(patient);
  const factors = keyFactors(patient, labelMap);

  return (
    <div className="grid-2col section-gap report-sections">
      <section className="report-section">
        <h3 className="report-section-title">
          <Icon name="clipboard" size={17} /> Input Parameters
        </h3>
        <ul className="report-kv">
          {rows.map(([label, value, unit]) => (
            <li key={label}>
              <span className="rk-label">{label}</span>
              <span className="rk-value">
                {value}
                {unit && <small>{unit}</small>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="report-section">
        <h3 className="report-section-title">
          <Icon name="trend" size={17} /> Key Factors
        </h3>
        {factors.length > 0 ? (
          <div className="factor-list">
            <div className="report-legend">
              <span><i className="dot dot-high" /> Raises risk</span>
              <span><i className="dot dot-low" /> Lowers risk</span>
            </div>
            {factors.map((f) => (
              <div className="factor-row" key={f.label}>
                <span title={f.label}>{f.label}</span>
                <div className="factor-track">
                  <div
                    className={`factor-fill ${f.raises ? "fill-high" : "fill-low"}`}
                    style={{ width: `${Math.min(95, Math.max(10, f.impact * 300))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="sub-text">No factor breakdown was saved with this record.</p>
        )}
      </section>
    </div>
  );
}
