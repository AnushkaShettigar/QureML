import { useEffect, useRef, useState } from "react";

import { API_BASE } from "./api";
import Icon from "./components/Icon";
import CountUp from "./components/CountUp";

const formatSize = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const pct = (p) => `${(p * 100).toFixed(1)}%`;

// One model's verdict: label chip, score, and a probability bar.
function ModelCard({ title, score, label, probability, tone, delay = 0 }) {
  return (
    <div className={`img-result-card model-${tone}`} style={{ animationDelay: `${0.2 + delay}s` }}>
      <div className="mc-title">{title}</div>
      <div className="mc-score"><CountUp value={score} duration={1100} /></div>
      <span className={`mc-label mc-label-${tone}`}>{label}</span>
      <div className="mc-bar" aria-hidden="true">
        <span style={{ "--w": `${Math.min(100, Math.max(0, probability * 100))}%` }} />
      </div>
      <div className="mc-prob">Probability {pct(probability)}</div>
    </div>
  );
}

export default function ImageScreening() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

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

  const selectFile = (f) => {
    setResult(null);
    setError(null);
    if (f && !/^image\/(png|jpeg)$/.test(f.type)) {
      setFile(null);
      setPreview(null);
      setError("Please choose a PNG or JPEG image.");
      return;
    }
    setFile(f || null);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const onPick = (e) => {
    selectFile(e.target.files?.[0]);
    e.target.value = ""; // allow picking the same file again
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    selectFile(e.dataTransfer.files?.[0]);
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

  const best = info?.cv?.length ? Math.max(...info.cv.map((r) => r.accuracy)) : null;
  const tone = (p) => (p >= 0.5 ? "high" : "low");

  return (
    <div className="imgscreen">
      <header className="page-header">
        <h1>
          Chest X-Ray Screening <span className="proto-chip">Phase 2 prototype</span>
        </h1>
        <p>Upload a chest X-ray and compare the hybrid quantum model with a classical baseline.</p>
      </header>

      <div className="grid-2col img-grid">
        {/* Upload */}
        <div className="card-panel">
          <h2>X-ray image</h2>

          {!file ? (
            <label
              className={`dropzone ${dragOver ? "is-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={onPick} />
              <span className="dz-orb"><Icon name="upload" size={28} /></span>
              <strong>Drop a chest X-ray here</strong>
              <span className="dz-sub">or click to browse · PNG or JPEG</span>
            </label>
          ) : (
            <div className="dz-file">
              <div className={`scan-frame ${loading ? "is-scanning" : ""}`}>
                <img className="img-preview" src={preview} alt="Uploaded X-ray" />
              </div>
              <div className="dz-meta">
                <div>
                  <strong title={file.name}>{file.name}</strong>
                  <span>{formatSize(file.size)}</span>
                </div>
                <button type="button" className="dz-remove" onClick={() => selectFile(null)} disabled={loading} aria-label="Remove image">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="img-alert" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          <button type="button" className="action-btn run-btn" onClick={analyze} disabled={!file || loading}>
            {loading
              ? <><span className="btn-spinner" aria-hidden="true" /> Analyzing X-ray…</>
              : <><Icon name="scan" size={18} className="icon-inline" /> Analyze X-ray</>}
          </button>
        </div>

        {/* Result */}
        <div className="card-panel result-panel">
          <h2>Result</h2>

          {loading && (
            <div className="img-skeletons" aria-busy="true">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          )}

          {!loading && result && (
            <div className="img-result">
              <div className={`img-verdict ${result.modelsAgree ? "is-agree" : "is-disagree"}`}>
                <Icon name={result.modelsAgree ? "check" : "alert"} size={18} />
                <span>{result.modelsAgree ? "Both models agree" : "The models disagree. Treat as uncertain."}</span>
              </div>
              <div className="img-model-row">
                <ModelCard
                  title="Hybrid (quantum)"
                  score={result.hybridRiskScore}
                  label={result.hybridLabel}
                  probability={result.hybridRiskProbability}
                  tone={tone(result.hybridRiskProbability)}
                />
                <ModelCard
                  title="Classical baseline"
                  score={result.classicalRiskScore}
                  label={result.classicalLabel}
                  probability={result.classicalRiskProbability}
                  tone={tone(result.classicalRiskProbability)}
                  delay={0.12}
                />
              </div>
              {result.note && (
                <p className="img-note"><Icon name="info" size={15} className="icon-inline" /> {result.note}</p>
              )}
            </div>
          )}

          {!loading && !result && (
            <div className="empty-state empty-state-rich">
              <div className="empty-orb"><Icon name="scan" size={30} /></div>
              <h3>No scan analysed yet</h3>
              <p>Upload a chest X-ray and press Analyze to see both models side by side.</p>
              <ol className="empty-steps">
                <li><span>1</span> Drop or choose an X-ray</li>
                <li><span>2</span> Press Analyze X-ray</li>
                <li><span>3</span> Compare the two models</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Measured performance */}
      {info && info.cv?.length > 0 && (
        <div className="card-panel perf-card">
          <div className="perf-head">
            <div>
              <h2>Measured performance</h2>
              <p className="sub-text">
                5-fold cross-validation on {info.nTrain + info.nTest} chest X-rays ({info.classes.join(" vs ")}).
              </p>
            </div>
            <span className="perf-scale">Bars span 0.5 → 1.0</span>
          </div>

          <table className="perf-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Accuracy</th>
                <th>ROC-AUC</th>
              </tr>
            </thead>
            <tbody>
              {info.cv.map((row, i) => (
                <tr key={row.label} style={{ "--i": i }} className={row.accuracy === best ? "is-best" : ""}>
                  <td>
                    <span className="perf-name">
                      {row.label}
                      {row.accuracy === best && <span className="perf-badge">Best accuracy</span>}
                      {/hybrid/i.test(row.label) && <span className="perf-badge perf-badge-q">Quantum</span>}
                    </span>
                  </td>
                  <td>
                    <div className="perf-cell">
                      <span>{row.accuracy.toFixed(3)} <small>± {row.accuracyStd.toFixed(3)}</small></span>
                      <div className="perf-bar"><span style={{ "--w": `${Math.max(0, (row.accuracy - 0.5) / 0.5) * 100}%` }} /></div>
                    </div>
                  </td>
                  <td>
                    <div className="perf-cell">
                      <span>{row.auc.toFixed(3)}</span>
                      <div className="perf-bar perf-bar-alt"><span style={{ "--w": `${Math.max(0, (row.auc - 0.5) / 0.5) * 100}%` }} /></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="img-note">
            <Icon name="info" size={15} className="icon-inline" /> The hybrid model did not outperform the classical baseline in these experiments.
          </p>
        </div>
      )}
    </div>
  );
}
