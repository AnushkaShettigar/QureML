import { useEffect, useState } from "react";
import { API_BASE } from "../api";

// Pings the API's /health endpoint now, every `intervalMs`, and whenever the
// tab becomes visible again. Returns null (checking), true (online) or false.
export default function useBackendStatus(intervalMs = 15000) {
  const [online, setOnline] = useState(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        if (alive) setOnline(res.ok);
      } catch {
        if (alive) setOnline(false);
      } finally {
        clearTimeout(timer);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    const id = setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return online;
}
