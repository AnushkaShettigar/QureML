import Icon from "./Icon";

function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

const ECG_POINTS = "0,12 18,12 24,3 32,21 38,12 72,12";

// Dashboard greeting: date, time-aware headline, heartbeat line, quick stats
// and a shortcut to start a new prediction.
export default function GreetingHeader({ username, latest, count, onNewPrediction }) {
  const now = new Date();
  const name = username ? username.charAt(0).toUpperCase() + username.slice(1) : "there";
  const dateText = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const tone = latest ? String(latest.priority || "low").toLowerCase() : "none";

  return (
    <header className="page-header hiq-greeting">
      <div className="greet-main">
        <p className="greet-eyebrow">
          <Icon name="calendar" size={14} className="icon-inline" /> {dateText}
        </p>

        <h1 className="greet-title">
          <span>{greetingFor(now.getHours())},</span>
          <span className="greet-name">{name}</span>
          <svg className="hiq-ecg" width="72" height="24" viewBox="0 0 72 24" fill="none" aria-hidden="true">
            <polyline className="hiq-ecg-base" points={ECG_POINTS} />
            <polyline className="hiq-ecg-line" pathLength="1" points={ECG_POINTS} />
          </svg>
        </h1>

        <div className="greet-chips">
          <span className="greet-chip">
            <Icon name="chart" size={14} />
            {count} {count === 1 ? "assessment" : "assessments"}
          </span>
          <span className={`greet-chip chip-${tone}`}>
            <Icon name={latest ? "heart" : "info"} size={14} />
            {latest ? `Latest: ${latest.priority} risk · ${latest.riskScore}%` : "No assessments yet"}
          </span>
        </div>
      </div>

      <button type="button" className="action-btn run-btn greet-cta" onClick={onNewPrediction}>
        <Icon name="plus" size={18} className="icon-inline" /> New Prediction
      </button>
    </header>
  );
}
