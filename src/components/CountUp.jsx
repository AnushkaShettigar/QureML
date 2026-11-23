import { useEffect, useRef, useState } from "react";

// Animates a number from 0 up to `value` (ease-out). Non-numeric values are
// shown as-is, and users who prefer reduced motion get the final value at once.
export default function CountUp({ value, suffix = "", duration = 900, decimals }) {
  const target = parseFloat(value);
  const isNumber = Number.isFinite(target);
  const [shown, setShown] = useState(isNumber ? 0 : target);
  const frame = useRef(0);

  useEffect(() => {
    if (!isNumber) return undefined;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return undefined;
    }

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, isNumber, duration]);

  if (!isNumber) return <>{String(value)}</>;

  const places = decimals ?? (Number.isInteger(target) ? 0 : 1);
  return <>{shown.toFixed(places)}{suffix}</>;
}
