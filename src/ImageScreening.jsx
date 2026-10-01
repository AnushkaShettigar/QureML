import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const card = {
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 12,
  padding: 16,
};

export default function ImageScreening() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/image/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    setResult(null);
    setError(null);
    setFile(f || null);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE}/image/predict-image`, { method: "POST", body });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.detail || `Server error (${res.status})`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err.message || "Could not reach the API.");
    } finally {
      setLoading(false);
    }
  };

  const pct = (p) => `${(p * 100).toFixed(1)}%`;

  return (
    <div>
      <h2>🩻 Chest X-Ray Screening (Phase 2 prototype)</h2>
      <p style={{ opacity: 0.8 }}>
        Image → frozen MobileNetV2 CNN → PCA (4) → quantum feature map → XGBoost, compared
        with a classical PCA → SVM baseline.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ ...card, flex: "1 1 280px" }}>
          <input type="file" accept="image/png,image/jpeg" onChange={onPick} />
          {preview && (
            <img
              src={preview}
              alt="Uploaded X-ray"
              style={{ display: "block", marginTop: 12, maxWidth: "100%", maxHeight: 320, borderRadius: 8 }}
            />
          )}
          <button onClick={analyze} disabled={!file || loading} style={{ marginTop: 12 }}>
            {loading ? "Analyzing…" : "Analyze X-ray"}
          </button>
          {error && <p style={{ color: "#e5484d", marginTop: 12 }}>⚠️ {error}</p>}
        </div>

        {result && (
          <div style={{ ...card, flex: "1 1 280px" }}>
            <h3 style={{ marginTop: 0 }}>Result</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ ...card, flex: 1 }}>
                <div style={{ opacity: 0.7, fontSize: 13 }}>Hybrid (quantum)</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{result.hybridRiskScore}</div>
                <div>{result.hybridLabel}</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>{pct(result.hybridRiskProbability)}</div>
              </div>
              <div style={{ ...card, flex: 1 }}>
                <div style={{ opacity: 0.7, fontSize: 13 }}>Classical baseline</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{result.classicalRiskScore}</div>
                <div>{result.classicalLabel}</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>{pct(result.classicalRiskProbability)}</div>
              </div>
            </div>
            <p style={{ marginTop: 12 }}>
              {result.modelsAgree ? "✅ Both models agree." : "⚠️ The models disagree. Treat as uncertain."}
            </p>
            <p style={{ fontSize: 13, opacity: 0.75 }}>{result.note}</p>
          </div>
        )}
      </div>

      {info && info.cv?.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Measured performance (5-fold cross-validation)</h3>
          <p style={{ fontSize: 13, opacity: 0.75 }}>
            {info.nTrain + info.nTest} chest X-rays ({info.classes.join(" vs ")}). The hybrid
            model did not outperform the classical baseline in these experiments.
          </p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: 6 }}>Model</th>
                <th style={{ padding: 6 }}>Accuracy</th>
                <th style={{ padding: 6 }}>ROC-AUC</th>
              </tr>
            </thead>
            <tbody>
              {info.cv.map((row) => (
                <tr key={row.label} style={{ borderTop: "1px solid rgba(128,128,128,0.25)" }}>
                  <td style={{ padding: 6 }}>{row.label}</td>
                  <td style={{ padding: 6 }}>
                    {row.accuracy.toFixed(3)} ± {row.accuracyStd.toFixed(3)}
                  </td>
                  <td style={{ padding: 6 }}>{row.auc.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
