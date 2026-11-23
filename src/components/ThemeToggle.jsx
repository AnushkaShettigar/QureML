import Icon from "./Icon";

// Day / night switch: a pill with a sliding knob. The knob morphs between a
// sun and a moon, and twinkling stars appear in the track in dark mode.
export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      data-tip={`Switch to ${next} mode`}
      className={`theme-toggle-fab theme-switch ${isDark ? "is-dark" : "is-light"}`}
      onClick={onToggle}
    >
      <span className="ts-stars" aria-hidden="true">
        <i /><i /><i /><i />
      </span>
      <span className="ts-thumb" aria-hidden="true">
        <Icon name="sun" size={16} className="ts-icon ts-sun" />
        <Icon name="moon" size={16} className="ts-icon ts-moon" />
      </span>
    </button>
  );
}
