import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { API_BASE } from "../api";

const TABS = [
  { id: "profile", label: "Profile", icon: "user", hint: "Your account" },
  { id: "security", label: "Security", icon: "lock", hint: "Password" },
  { id: "appearance", label: "Appearance", icon: "palette", hint: "Light or dark" },
  { id: "preferences", label: "Preferences", icon: "bell", hint: "Alerts and tables" },
  { id: "thresholds", label: "Risk thresholds", icon: "chart", hint: "Priority levels" },
];

const DEFAULT_HIGH = 70;
const DEFAULT_MODERATE = 40;

// --- password helpers -------------------------------------------------------
const RULES = [
  { id: "len", label: "At least 8 characters", required: true, test: (p) => p.length >= 8 },
  { id: "case", label: "Upper and lower case letters", test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: "num", label: "A number", test: (p) => /\d/.test(p) },
  { id: "sym", label: "A symbol (for example ! ? #)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

function PasswordField({ id, label, value, onChange, autoComplete, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="pw-eye"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          <Icon name={show ? "eyeOff" : "eye"} size={18} />
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage({ settings, onSettingChange, username, role, accountId, onChangePassword, onSignOut }) {
  const [tab, setTab] = useState("profile");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwStatus, setPwStatus] = useState(null); // { ok, message }
  const timers = useRef({});

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  // Email and join date come from the existing /auth/me endpoint.
  // undefined = loading, null = unavailable, object = ready.
  const [profile, setProfile] = useState(undefined);
  useEffect(() => {
    const token = sessionStorage.getItem("qrisk_token");
    if (!token) {
      setProfile(null);
      return undefined;
    }
    let alive = true;
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setProfile(d ? { email: d.email, createdAt: d.created_at } : null))
      .catch(() => alive && setProfile(null));
    return () => {
      alive = false;
    };
  }, []);

  const memberSince =
    profile && profile.createdAt
      ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : null;

  const flash = (key, setter, ms) => {
    setter(true);
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => setter(false), ms);
  };

  const change = (key, value) => {
    onSettingChange(key, value);
    flash("saved", setSaved, 1800);
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(accountId || "");
      flash("copied", setCopied, 1600);
    } catch {
      /* clipboard not available: ignore */
    }
  };

  const roleLabel = role === "admin" ? "System Administrator" : "Patient";
  const initial = (username || "U").charAt(0).toUpperCase();

  // password state
  const score = RULES.filter((r) => r.test(pw.next)).length;
  const lenOk = pw.next.length >= 8;
  const matches = pw.confirm.length > 0 && pw.next === pw.confirm;
  const canSubmit = pw.current.length > 0 && lenOk && matches && !pwBusy;

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPwBusy(true);
    setPwStatus(null);
    const res = await onChangePassword(pw.current, pw.next);
    setPwBusy(false);
    setPwStatus(res);
    if (res.ok) setPw({ current: "", next: "", confirm: "" });
  };

  // thresholds
  const high = settings.highRiskThreshold;
  const mod = settings.moderateRiskThreshold;
  const zonesInvalid = mod >= high;
  const isDefault = high === DEFAULT_HIGH && mod === DEFAULT_MODERATE;

  const onTabKey = (e) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !backward) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (forward ? 1 : -1) + TABS.length) % TABS.length];
    setTab(next.id);
  };

  const active = TABS.find((t) => t.id === tab);

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1>Settings</h1>
        <p>Manage your account, security and how the portal looks and behaves.</p>
      </header>

      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className={`settings-tab ${tab === t.id ? "is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={17} />
              <span className="st-text"><strong>{t.label}</strong></span>
            </button>
          ))}
        </nav>

        <section className="settings-panel card-panel" key={tab} role="tabpanel" aria-label={active.label}>
          <div className="sp-head">
            <div>
              <h2>{active.label}</h2>
            </div>
            <span className={`saved-pill ${saved ? "is-on" : ""}`} aria-live="polite">
              <Icon name="check" size={14} /> Saved
            </span>
          </div>

          {/* ---------------- PROFILE ---------------- */}
          {tab === "profile" && (
            <>
              <div className="set-hero">
                <div className="set-avatar">{initial}</div>
                <div className="set-hero-text">
                  <h3>{username || "User"}</h3>
                  <div className="set-chips">
                    <span className="set-chip">{roleLabel}</span>
                  </div>
                </div>
              </div>

              <div className="set-details">
                <div className="set-detail">
                  <span>Account ID</span>
                  <div className="set-detail-value">
                    <strong className="font-mono">{accountId || "-"}</strong>
                    <button type="button" className="set-copy" onClick={copyId} aria-label="Copy account ID">
                      <Icon name={copied ? "check" : "copy"} size={14} />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="set-detail">
                  <span>Email</span>
                  <strong>{profile === undefined ? <i className="skeleton-line sk-sm" /> : (profile && profile.email) || "-"}</strong>
                </div>
                <div className="set-detail">
                  <span>Member since</span>
                  <strong>{profile === undefined ? <i className="skeleton-line sk-sm" /> : memberSince || "-"}</strong>
                </div>
                <div className="set-detail">
                  <span>Portal</span>
                  <strong>{role === "admin" ? "Doctor console" : "Patient portal"}</strong>
                </div>
              </div>

              <div className="set-row-card">
                <div>
                  <strong>Sign out</strong>
                  <p>End your session on this device. You will need your username and password to sign back in.</p>
                </div>
                <button type="button" className="set-btn-danger" onClick={onSignOut}>
                  <Icon name="logout" size={16} className="icon-inline" /> Sign out
                </button>
              </div>
            </>
          )}

          {/* ---------------- SECURITY ---------------- */}
          {tab === "security" && (
            <form className="set-form" onSubmit={submitPassword}>
              <p className="sp-lead">Choose a new password for your account. You will stay signed in on this device.</p>

              <PasswordField
                id="pw-current"
                label="Current password"
                value={pw.current}
                onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                autoComplete="current-password"
                placeholder="Enter your current password"
              />
              <PasswordField
                id="pw-next"
                label="New password"
                value={pw.next}
                onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                autoComplete="new-password"
                placeholder="Choose a new password"
              />

              {pw.next.length > 0 && (
                <div className="pw-strength" data-level={score}>
                  <div className="pw-meter" aria-hidden="true">
                    <span /><span /><span /><span />
                  </div>
                  <strong>{STRENGTH_LABELS[score] || "Weak"}</strong>
                </div>
              )}

              <ul className="pw-rules">
                {RULES.map((r) => {
                  const ok = r.test(pw.next);
                  return (
                    <li key={r.id} className={ok ? "is-ok" : ""}>
                      <Icon name={ok ? "check" : "plus"} size={14} />
                      {r.label}
                      {r.required && <em>required</em>}
                    </li>
                  );
                })}
              </ul>

              <PasswordField
                id="pw-confirm"
                label="Confirm new password"
                value={pw.confirm}
                onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                autoComplete="new-password"
                placeholder="Re-enter the new password"
              />
              {pw.confirm.length > 0 && (
                <p className={`pw-match ${matches ? "is-ok" : "is-bad"}`}>
                  <Icon name={matches ? "check" : "alert"} size={14} className="icon-inline" />
                  {matches ? "Passwords match" : "Passwords do not match"}
                </p>
              )}

              {pwStatus && (
                <div className={`set-alert ${pwStatus.ok ? "is-ok" : "is-bad"}`} role="status">
                  <Icon name={pwStatus.ok ? "check" : "alert"} size={18} />
                  <span>{pwStatus.ok ? "Password updated. Use it the next time you sign in." : pwStatus.message}</span>
                </div>
              )}

              <button type="submit" className="action-btn run-btn" disabled={!canSubmit}>
                {pwBusy ? <><span className="btn-spinner" aria-hidden="true" /> Updating...</> : <><Icon name="lock" size={17} className="icon-inline" /> Update password</>}
              </button>
            </form>
          )}

          {/* ---------------- APPEARANCE ---------------- */}
          {tab === "appearance" && (
            <>
              <p className="sp-lead">Pick how the whole portal looks, including the sign-in screen. The switch at the top right does the same thing.</p>
              <div className="theme-cards" role="radiogroup" aria-label="Theme">
                {["light", "dark"].map((mode) => {
                  const on = settings.theme === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`theme-card ${on ? "is-selected" : ""}`}
                      onClick={() => change("theme", mode)}
                    >
                      <span className={`theme-preview preview-${mode}`} aria-hidden="true">
                        <i className="tp-side" />
                        <i className="tp-bar" />
                        <i className="tp-card" />
                        <i className="tp-card tp-card-2" />
                      </span>
                      <span className="theme-card-label">
                        <Icon name={mode === "light" ? "sun" : "moon"} size={16} />
                        {mode === "light" ? "Light" : "Dark"}
                        {on && <Icon name="check" size={16} className="tc-check" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ---------------- PREFERENCES ---------------- */}
          {tab === "preferences" && (
            <div className="set-list">
              <div className="setting-row">
                <div>
                  <p className="setting-title">Confirmation alerts</p>
                  <p className="sub-text">Show a popup confirmation after saving a patient record.</p>
                </div>
                <label className="toggle-slider">
                  <input type="checkbox" checked={settings.soundAlerts} onChange={(e) => change("soundAlerts", e.target.checked)} />
                  <span className="toggle-track"><span className="toggle-thumb"></span></span>
                </label>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-title">Compact table view</p>
                  <p className="sub-text">Reduce row height in the patient tables.</p>
                </div>
                <label className="toggle-slider">
                  <input type="checkbox" checked={settings.compactTable} onChange={(e) => change("compactTable", e.target.checked)} />
                  <span className="toggle-track"><span className="toggle-thumb"></span></span>
                </label>
              </div>
            </div>
          )}

          {/* ---------------- THRESHOLDS ---------------- */}
          {tab === "thresholds" && (
            <>
              <p className="sp-lead">Decide where a risk score becomes Moderate or High priority. This changes how new results are labelled.</p>

              <div className="zone-bar" aria-hidden="true">
                <span className="zone zone-low" style={{ flexGrow: Math.max(mod, 0) }}>Low</span>
                <span className="zone zone-mod" style={{ flexGrow: Math.max(high - mod, 0) }}>Moderate</span>
                <span className="zone zone-high" style={{ flexGrow: Math.max(100 - high, 0) }}>High</span>
              </div>
              <ul className="zone-legend">
                <li><i className="dot dot-low" /> Low <b>0-{mod}%</b></li>
                <li><i className="dot dot-moderate" /> Moderate <b>{mod}-{high}%</b></li>
                <li><i className="dot dot-high" /> High <b>{high}-100%</b></li>
              </ul>

              {zonesInvalid && (
                <div className="set-alert is-bad" role="alert">
                  <Icon name="alert" size={18} />
                  <span>The Moderate threshold should be lower than High, or no score will be labelled Moderate.</span>
                </div>
              )}

              <div className="set-slider">
                <div className="set-slider-head">
                  <div>
                    <p className="setting-title">High risk threshold</p>
                    <p className="sub-text">Scores above this are classified as High priority.</p>
                  </div>
                  <span className="set-slider-value">{high}%</span>
                </div>
                <input
                  type="range" min="50" max="95" step="1" value={high}
                  onChange={(e) => change("highRiskThreshold", Number(e.target.value))}
                  className="range-slider"
                  style={{ "--fill": `${((high - 50) / 45) * 100}%` }}
                  aria-label="High risk threshold"
                />
                <div className="range-scale"><span>50%</span><span>95%</span></div>
              </div>

              <div className="set-slider">
                <div className="set-slider-head">
                  <div>
                    <p className="setting-title">Moderate risk threshold</p>
                    <p className="sub-text">Scores above this (and below High) are Moderate priority.</p>
                  </div>
                  <span className="set-slider-value">{mod}%</span>
                </div>
                <input
                  type="range" min="10" max="60" step="1" value={mod}
                  onChange={(e) => change("moderateRiskThreshold", Number(e.target.value))}
                  className="range-slider"
                  style={{ "--fill": `${((mod - 10) / 50) * 100}%` }}
                  aria-label="Moderate risk threshold"
                />
                <div className="range-scale"><span>10%</span><span>60%</span></div>
              </div>

              <button
                type="button"
                className="set-btn-ghost"
                disabled={isDefault}
                onClick={() => { change("highRiskThreshold", DEFAULT_HIGH); onSettingChange("moderateRiskThreshold", DEFAULT_MODERATE); }}
              >
                Reset to defaults ({DEFAULT_HIGH}% / {DEFAULT_MODERATE}%)
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
