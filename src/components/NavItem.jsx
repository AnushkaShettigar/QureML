import Icon from "./Icon";

// One sidebar link: icon, label and an optional count badge.
export default function NavItem({ icon, label, active, onClick, badge = 0 }) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
      <span className="nav-label">{label}</span>
      {badge > 0 && <span className="nav-badge" aria-label={`${badge} records`}>{badge}</span>}
    </button>
  );
}
