// Single source of truth for the ML API location (see ml/api.py).
// Override with VITE_API_URL when the API is deployed somewhere else.
export const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
export const QRISK_API_URL = `${API_BASE}/predict`;
