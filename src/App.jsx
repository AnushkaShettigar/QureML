import Landing from "./Landing";
import React, { useState, useEffect, useRef, useCallback } from "react";
import QuantumBackground from "./QuantumBackground.jsx";
import ImageScreening from "./ImageScreening";
import { API_BASE, QRISK_API_URL } from "./api";
import ThemeToggle from "./components/ThemeToggle";
import RiskHistoryChart from "./components/RiskHistoryChart";
import CountUp from "./components/CountUp";
import Icon from "./components/Icon";
import FlowerLogo from "./components/FlowerLogo";
import NavItem from "./components/NavItem";
import GreetingHeader from "./components/GreetingHeader";
import SettingsPage from "./components/SettingsPage";
import useBackendStatus from "./hooks/useBackendStatus";
import ReportSections from "./components/ReportSections";
import { printReport } from "./printReport";

// Feature Display Labels
const featureLabelMap = {
  "DiabetesPedigreeFunction": "Family history score",
  "BloodPressure": "Blood pressure",
  "BMI": "BMI",
  "Glucose": "2-hour glucose",
  "Insulin": "Insulin",
  "Age": "Age",
  "SkinThickness": "Skin thickness",
  "Pregnancies": "Pregnancies",
  "worst_concave_points": "Worst concave points",
  "mean_concave_points": "Mean concave points",
  "worst_radius": "Worst radius",
  "worst_perimeter": "Worst perimeter",
  "mean_area": "Mean area",
  "mean_texture": "Mean texture"
};

// Initial Audit Logs (Admin View)
const initialLogs = [
  { id: "LOG-881", user: "dr_anushka", action: "Generated QRISK Score (BC-1092)", timestamp: "10 mins ago" },
  { id: "LOG-882", user: "admin_user", action: "Updated VQC Circuit Depth to 12 Layers", timestamp: "1 hour ago" },
  { id: "LOG-883", user: "dr_khushu", action: "Accessed Patient Database Queue", timestamp: "3 hours ago" }
];

// ---------------------------------------------------------------------------
// ACCOUNT SYSTEM: password hashing + persisted login store (replaces OTP demo)
// ---------------------------------------------------------------------------

// Lightweight deterministic hash so raw passwords are never written to
// localStorage. This is a client-only demo, not a substitute for real
// server-side hashing (bcrypt/argon2) in a production system.
function hashPassword(password) {
  let hash = 5381;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) + hash) + password.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + "-" + password.length.toString(36);
}

function generateAccountId(role) {
  const prefix = role === "admin" ? "ADM" : "USR";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${num}`;
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const ACCOUNTS_KEY = "qrisk_accounts_v1";

// Seeds one ready-to-use admin account and one ready-to-use user account
// with freshly generated IDs and passwords, so the portal is usable without
// a manual registration step.
function seedDefaultAccounts() {
  // Set your preferred static credentials here
  const adminPassword = "123456";
  const userPassword = "123456";

  const accounts = [
    {
      accountId: "ADM-1001",
      username: "admin",
      email: "admin@qrisk.local",
      passwordHash: hashPassword(adminPassword),
      role: "admin"
    },
    {
      accountId: "USR-1002",
      username: "user",
      email: "user@qrisk.local",
      passwordHash: hashPassword(userPassword),
      role: "user"
    }
  ];

  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  localStorage.setItem("qrisk_seed_credentials_v1", JSON.stringify({
    admin: { username: "admin", password: adminPassword },
    user: { username: "user", password: userPassword }
  }));

  return accounts;
}

export default function App() {
  // Interactive quantum background — landing page only
  const [activeCard, setActiveCard] = useState(null);
  const clinicianRef = useRef(null);
  const adminRef = useRef(null);
  const [cardRects, setCardRects] = useState({
    clinician: null,
    admin: null,
  });

  const updateCardRects = useCallback(() => {
    setCardRects({
      clinician: clinicianRef.current
        ? clinicianRef.current.getBoundingClientRect()
        : null,
      admin: adminRef.current
        ? adminRef.current.getBoundingClientRect()
        : null,
    });
  }, []);

  useEffect(() => {
    updateCardRects();
    window.addEventListener("resize", updateCardRects);

    return () => {
      window.removeEventListener("resize", updateCardRects);
    };
  }, [updateCardRects]);

  // Authentication & Role State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState(null); // 'user' or 'admin'
  const [authMode, setAuthMode] = useState("login"); // 'login' or 'register'

  // Auth Form
  const [authData, setAuthData] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [currentAccountId, setCurrentAccountId] = useState(null);

  const [accounts, setAccounts] = useState(() => {
    const saved = localStorage.getItem(ACCOUNTS_KEY);
    if (saved) return JSON.parse(saved);
    return seedDefaultAccounts();
  });

  useEffect(() => {
    const restoreSession = async () => {
      const token = sessionStorage.getItem("qrisk_token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setRole(data.role);
          setCurrentAccountId(data.account_id);
          setAuthData(prev => ({ ...prev, username: data.username }));
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem("qrisk_token");
        }
      } catch (e) {
        console.error("Session restoration failed:", e);
      }
    };
    restoreSession();
  }, []);

  const [seedCredentials] = useState(() => {
    const saved = localStorage.getItem("qrisk_seed_credentials_v1");
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }, [accounts]);

  // App Settings (Settings page)
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("qrisk_settings_v1");
    const defaults = {
      compactTable: false,
      soundAlerts: true,
      highRiskThreshold: 70,
      moderateRiskThreshold: 40,
      theme: "dark" // single source of truth for dark/light mode, everywhere
    };
    const merged = saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    // Migrate the old, disconnected "dashboardDark" flag if it's present from a
    // previous version so a returning user's preference still carries over.
    if (typeof merged.dashboardDark === "boolean") {
      merged.theme = merged.dashboardDark ? "dark" : merged.theme;
      delete merged.dashboardDark;
    }
    return merged;
  });

  useEffect(() => {
    localStorage.setItem("qrisk_settings_v1", JSON.stringify(settings));
  }, [settings]);

  // Apply the chosen theme to the whole document (drives both the sign-in
  // screen AND the dashboard — one switch controls everything).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  const toggleTheme = () => {
    setSettings((prev) => ({ ...prev, theme: prev.theme === "dark" ? "light" : "dark" }));
  };


  // Sign-out confirmation popup
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // SHAP Explanation Modal
  const [showShapModal, setShowShapModal] = useState(false);

  // Risk calculation "in progress" state (drives the riskmeter animation)
  const [isCalculating, setIsCalculating] = useState(false);
  const [riskError, setRiskError] = useState("");

  // Navigation (Set defaults dynamically based on Role)
  const [activeTab, setActiveTab] = useState("dashboard");

  // Live API status for the sidebar indicator
  const backendOnline = useBackendStatus();

  // Patient Database State
  const [patients, setPatients] = useState(() => {
    const saved = localStorage.getItem("qrisk_patients_v3");
    return saved ? JSON.parse(saved) : [];
  });

  const [logs, setLogs] = useState(initialLogs);
  const [queueFilter, setQueueFilter] = useState("All");
  const [reportPatient, setReportPatient] = useState(null);

  // Screening Form Data
  const [formData, setFormData] = useState({
    patientName: "",
    worst_concave_points: 0.1471,
    mean_concave_points: 0.0869,
    worst_radius: 25.38,
    worst_perimeter: 184.6,
    mean_area: 1001.0,
    mean_texture: 10.38,
    // Diabetes specific defaults
    height_cm: 165,
    weight_kg: 88,
    glucose: 117,
    age: 29,
    blood_pressure: 72,
    insulin: "",
    diabetes_pedigree: "0.37"
  });

  const [calculatedRisk, setCalculatedRisk] = useState(null);
  const [samplePatients, setSamplePatients] = useState([]);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [diseases, setDiseases] = useState({});
  const [selectedDisease, setSelectedDisease] = useState("breast_cancer");

  useEffect(() => {
    fetch(`${API_BASE}/diseases`)
      .then(res => res.json())
      .then(data => setDiseases(data))
      .catch(err => console.error("Could not load diseases:", err));
    fetch(`${API_BASE}/health`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "ok") {
          setModelMetrics(data);
        }
      })
      .catch(err => console.error("Could not load model metrics:", err));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/sample-patients?disease_type=${selectedDisease}`)
      .then(res => res.json())
      .then(data => setSamplePatients(data))
      .catch(err => console.error("Could not load sample patients:", err));
  }, [selectedDisease]);

  const handleSampleSelect = (e) => {
    const pId = e.target.value;
    if (!pId) return;
    const p = samplePatients.find(x => x.id === pId);
    if (p) {
      if (selectedDisease === "breast_cancer") {
        setFormData(prev => ({
          ...prev,
          patientName: p.name,
          worst_concave_points: p.worst_concave_points,
          mean_concave_points: p.mean_concave_points,
          worst_radius: p.worst_radius,
          worst_perimeter: p.worst_perimeter,
          mean_area: p.mean_area,
          mean_texture: p.mean_texture
        }));
      } else {
        const h_m = 1.70;
        const w_kg = (p.bmi || 32.3) * (h_m * h_m);

        // Use default map for family history to match UI options closest
        let closest_pedigree = "0.37";
        if (p.diabetes_pedigree <= 0.3) closest_pedigree = "0.24";
        else if (p.diabetes_pedigree >= 0.5) closest_pedigree = "0.63";
        else closest_pedigree = "0.37";

        setFormData(prev => ({
          ...prev,
          patientName: p.name,
          height_cm: 170,
          weight_kg: Math.round(w_kg * 10) / 10,
          glucose: p.glucose || 117,
          age: p.age || 29,
          blood_pressure: p.blood_pressure || 72,
          insulin: p.insulin ?? "",
          diabetes_pedigree: closest_pedigree
        }));
      }
    }
  };

  useEffect(() => {
    localStorage.setItem("qrisk_patients_v3", JSON.stringify(patients));
  }, [patients]);

  // Auth Handlers
  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    setActiveTab("dashboard");
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authData.username || !authData.password) {
      alert("Please enter both username and password.");
      return;
    }

    if (authMode === "register") {
      if (role === "admin") {
        alert("Admin registration is not allowed.");
        return;
      }
      if (!authData.email) {
        alert("Email address is required.");
        return;
      }
      if (authData.password !== authData.confirmPassword) {
        alert("Passwords do not match. Please re-enter.");
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: authData.username,
            email: authData.email,
            password: authData.password,
            role: "user"
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          alert(errorData.detail || "Registration failed.");
          return;
        }

        const data = await response.json();
        const token = data.access_token;
        sessionStorage.setItem("qrisk_token", token);

        const meResponse = await fetch(`${API_BASE}/auth/me`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (meResponse.ok) {
          const meData = await meResponse.json();
          setCurrentAccountId(meData.account_id);
          setAuthData(prev => ({ ...prev, username: meData.username }));
          setIsAuthenticated(true);
          alert(`Account created successfully! Your Account ID is ${meData.account_id} — keep it safe, you can use it (or your username) to sign in later.`);
        } else {
          alert("Registration successful, but failed to retrieve user profile. Please log in.");
          setAuthMode("login");
        }
      } catch (err) {
        alert("Network error: Could not reach the server.");
      }
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authData.username,
          password: authData.password,
          role: role
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.detail || "Invalid username/ID or password.");
        return;
      }

      const data = await response.json();
      const token = data.access_token;
      sessionStorage.setItem("qrisk_token", token);

      const meResponse = await fetch(`${API_BASE}/auth/me`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (meResponse.ok) {
        const meData = await meResponse.json();
        setCurrentAccountId(meData.account_id);
        setAuthData(prev => ({ ...prev, username: meData.username }));
        setIsAuthenticated(true);
      } else {
        alert("Failed to retrieve user profile.");
      }
    } catch (err) {
      alert("Network error: Could not reach the server.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("qrisk_token");
    setIsAuthenticated(false);
    setRole(null);
    setCurrentAccountId(null);
    setActiveTab("dashboard");
    setAuthData({ username: "", email: "", password: "", confirmPassword: "" });
    setShowLogoutConfirm(false);
  };

  const requestLogout = () => setShowLogoutConfirm(true);
  const cancelLogout = () => setShowLogoutConfirm(false);

  // Settings Page Actions
  const handleSettingChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Changes the password on the server (the account lives in the database).
  // Returns { ok, message } so the Settings page can show the result inline.
  const changePasswordRequest = async (current, next) => {
    const token = sessionStorage.getItem("qrisk_token");
    if (!token) return { ok: false, message: "Your session has expired. Please sign out and sign in again." };
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ current_password: current, new_password: next })
      });
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => ({}));
      const detail = typeof body.detail === "string" ? body.detail : "Could not update the password.";
      return { ok: false, message: detail };
    } catch {
      return { ok: false, message: "Could not reach the server. Please try again in a moment." };
    }
  };

  // Screening Logic
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };


  const handleCalculateRisk = async (e) => {
    e.preventDefault();
    setCalculatedRisk(null);
    setRiskError("");
    setIsCalculating(true);

    try {
      let featuresToSend = {};
      if (selectedDisease === "breast_cancer") {
        featuresToSend = {
          worst_concave_points: Number(formData.worst_concave_points),
          mean_concave_points: Number(formData.mean_concave_points),
          worst_radius: Number(formData.worst_radius),
          worst_perimeter: Number(formData.worst_perimeter),
          mean_area: Number(formData.mean_area),
          mean_texture: Number(formData.mean_texture)
        };
      } else {
        const h_m = Number(formData.height_cm) / 100;
        const computedBmi = Number(formData.weight_kg) / (h_m * h_m);
        featuresToSend = {
          glucose: Number(formData.glucose),
          bmi: computedBmi,
          age: Number(formData.age),
          blood_pressure: Number(formData.blood_pressure),
          diabetes_pedigree: Number(formData.diabetes_pedigree),
          insulin: formData.insulin === "" || formData.insulin === null ? null : Number(formData.insulin)
        };
      }

      const token = sessionStorage.getItem("qrisk_token");
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(QRISK_API_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          disease_type: selectedDisease,
          features: featuresToSend
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `API returned ${response.status}`);
      }

      const prediction = await response.json();
      const score = prediction.hybridRiskScore;
      // Priority still respects the thresholds configurable on the Settings
      // page, applied to the model's real score rather than a fixed cutoff.
      const priority = score > settings.highRiskThreshold ? "High" : score > settings.moderateRiskThreshold ? "Moderate" : "Low";

      setCalculatedRisk({
        ...formData,
        riskScore: score,
        priority,
        survivalRate: prediction.survivalRate,
        explanation: prediction.explanation,
        hybridTestAccuracy: prediction.hybridTestAccuracy,
        classicalTestAccuracy: prediction.classicalTestAccuracy,
        classicalRiskScore: prediction.classicalRiskScore,
        hybridLabel: prediction.hybridLabel,
        classicalLabel: prediction.classicalLabel,
        modelsAgree: prediction.modelsAgree,
        note: prediction.note,
        calcification: selectedDisease === "breast_cancer" ? "Pleomorphic" : "N/A",
        imputed_features: prediction.imputed_features || [],
        id: selectedDisease === "breast_cancer"
          ? `BC-${Math.floor(1000 + Math.random() * 9000)}`
          : `DB-${Math.floor(1000 + Math.random() * 9000)}`
      });
    } catch (err) {
      setRiskError(
        `Couldn't reach the prediction model (${err.message}). Is the API running? (cd ml && uvicorn api:app --reload --port 8000)`
      );
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSaveToQueue = () => {
    if (!calculatedRisk || calculatedRisk.saved) return;

    const prefix = selectedDisease === "breast_cancer" ? "BC" : "DB";
    const newId = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newPatient = {
      ...calculatedRisk,
      id: newId,
      patientName: formData.patientName || "Unknown Patient",
      name: formData.patientName || "Unknown Patient", // Support both keys
      diseaseType: selectedDisease,
      riskScore: calculatedRisk.riskScore,
      classicalRiskPercent: calculatedRisk.classicalRiskScore,
      priority: calculatedRisk.priority,
      createdAt: new Date().toISOString()
    };

    setCalculatedRisk({ ...calculatedRisk, saved: true });
    setPatients([newPatient, ...patients]);
    // Add entry to logs
    setLogs([{
      id: `LOG-${Math.floor(100 + Math.random() * 900)}`,
      user: authData.username || "Dr. Medical User",
      action: `Created Patient Screening (${newId})`,
      timestamp: "Just now"
    }, ...logs]);

    if (settings.soundAlerts) {
      alert("Patient record successfully processed!");
    }
  };

  // Admin Actions
  const handleDeletePatient = (id) => {
    if (window.confirm(`Are you sure you want to delete patient record ${id}?`)) {
      setPatients(patients.filter(p => p.id !== id));
    }
  };

  const handleViewReport = (patient) => {
    setReportPatient(patient);
    setActiveTab("reports");
  };

  const filteredPatients = patients.filter(p => {
    if (queueFilter === "All") return true;
    return p.priority === queueFilter;
  });

  // ---------------------------------------------------------------------------
  // VIEW 1: AUTHENTICATION GATEWAY
  // ---------------------------------------------------------------------------
  if (!isAuthenticated && !role) {
    return <Landing onSelectRole={handleRoleSelect} />;
  }
  if (!isAuthenticated) {
    return (
      <div className="auth-wrapper">
        <ThemeToggle theme={settings.theme} onToggle={toggleTheme} />
        <QuantumBackground
          isDark={settings.theme === "dark"}
          activeCard={activeCard}
          cardRects={cardRects}
        />
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo"><FlowerLogo size={72} /></div>
            <h1>QureML</h1>
            <p>Early Disease Prediction Portal</p>
          </div>

          {!role ? (
            <div className="role-selection">
              <h3>Select Portal View Mode</h3>
              <div className="role-grid">
                <button
                  ref={clinicianRef}
                  className="role-btn"
                  onMouseEnter={() => {
                    updateCardRects();
                    setActiveCard("clinician");
                  }}
                  onMouseLeave={() => setActiveCard(null)}
                  onFocus={() => {
                    updateCardRects();
                    setActiveCard("clinician");
                  }}
                  onBlur={() => setActiveCard(null)}
                  onClick={() => handleRoleSelect("user")}
                >
                  <span className="role-icon"><Icon name="stethoscope" size={30} /></span>
                  <span className="role-title">Clinician / User View</span>
                  <span className="role-desc">Focus on Patient Screening & Diagnostics</span>
                </button>
                <button
                  ref={adminRef}
                  className="role-btn"
                  onMouseEnter={() => {
                    updateCardRects();
                    setActiveCard("admin");
                  }}
                  onMouseLeave={() => setActiveCard(null)}
                  onFocus={() => {
                    updateCardRects();
                    setActiveCard("admin");
                  }}
                  onBlur={() => setActiveCard(null)}
                  onClick={() => handleRoleSelect("admin")}
                >
                  <span className="role-icon"><Icon name="bolt" size={30} /></span>
                  <span className="role-title">Administrator View</span>
                  <span className="role-desc">Full Database, Priority Queues & Logs</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="auth-form-container">
              <div className="auth-nav-back">
                <button onClick={() => setRole(null)}>← Back</button>
                <span className="role-badge">{role.toUpperCase()} PORTAL</span>
              </div>

              <div className="auth-tabs">
                <button
                  className={authMode === "login" ? "active" : ""}
                  onClick={() => setAuthMode("login")}
                >
                  Sign In
                </button>
                <button
                  className={authMode === "register" ? "active" : ""}
                  onClick={() => setAuthMode("register")}
                >
                  Register
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="auth-form">
                <div className="form-group">
                  <label>Username / Account ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. dr_khushu"
                    value={authData.username}
                    onChange={(e) => setAuthData({ ...authData, username: e.target.value })}
                  />
                </div>

                {authMode === "register" && (
                  <div className="form-group">
                    <label>Medical Email</label>
                    <input
                      type="email"
                      required
                      placeholder="doctor@hospital.org"
                      value={authData.email}
                      onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authData.password}
                    onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                  />
                </div>

                {authMode === "register" && (
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={authData.confirmPassword}
                      onChange={(e) => setAuthData({ ...authData, confirmPassword: e.target.value })}
                    />
                  </div>
                )}

                <button type="submit" className="submit-btn">
                  {authMode === "register" ? "Create Account" : "Sign In"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW 2: DASHBOARD (ADMIN VS USER ROUTING)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // VIEW 2: DASHBOARD (ADMIN VS USER ROUTING)
  // ---------------------------------------------------------------------------

  // Derived data for charts / overview cards
  const totalPatients = patients.length;
  const highCount = patients.filter(p => p.priority === "High").length;
  const modCount = patients.filter(p => p.priority === "Moderate").length;
  const lowCount = patients.filter(p => p.priority === "Low").length;
  const avgRisk = totalPatients ? Math.round(patients.reduce((s, p) => s + (p.riskScore || 0), 0) / totalPatients) : 0;
  const highPct = totalPatients ? Math.round((highCount / totalPatients) * 100) : 0;
  const modPct = totalPatients ? Math.round((modCount / totalPatients) * 100) : 0;
  const lowPct = 100 - highPct - modPct;

  const latest = patients[0];
  const donutStyle = {
    background: `conic-gradient(var(--hiq-danger) 0% ${highPct}%, var(--hiq-warning) ${highPct}% ${highPct + modPct}%, var(--hiq-success) ${highPct + modPct}% 100%)`
  };

  const reportSource = reportPatient || latest;

  return (
    <div className={`dashboard-layout ${settings.theme === "dark" ? "theme-dark" : ""}`}>
      <ThemeToggle theme={settings.theme} onToggle={toggleTheme} />
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon"><FlowerLogo size={48} /></span>
          <div>
            <h2>QureML</h2>
            <span className="version-tag">{role === "admin" ? "Doctor Console" : "Patient Portal"}</span>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Main navigation">
          {/* USER SPECIFIC NAVIGATION */}
          {role === "user" && (
            <>
              <p className="nav-section">Menu</p>
              <NavItem icon="home" label="Dashboard" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
              <NavItem icon="plus" label="New Prediction" active={activeTab === "screening"} onClick={() => setActiveTab("screening")} />
              <NavItem icon="history" label="History" badge={patients.length} active={activeTab === "userhistory"} onClick={() => setActiveTab("userhistory")} />
              <NavItem icon="file" label="Reports" active={activeTab === "reports"} onClick={() => setActiveTab("reports")} />
            </>
          )}

          {/* ADMIN SPECIFIC NAVIGATION */}
          {role === "admin" && (
            <>
              <p className="nav-section">Clinic</p>
              <NavItem icon="home" label="Doctor Dashboard" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
              <NavItem icon="clipboard" label="Patient Queue & Database" badge={patients.length} active={activeTab === "database"} onClick={() => setActiveTab("database")} />
              <NavItem icon="bolt" label="Quantum Model Benchmarks" active={activeTab === "benchmarks"} onClick={() => setActiveTab("benchmarks")} />
              <NavItem icon="shield" label="System & Audit Logs" active={activeTab === "logs"} onClick={() => setActiveTab("logs")} />
            </>
          )}

          <p className="nav-section">Tools</p>
          <NavItem icon="scan" label="Image Screening" active={activeTab === "imagescreen"} onClick={() => setActiveTab("imagescreen")} />

          <p className="nav-section">Account</p>
          <NavItem icon="settings" label="Profile & Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
        </nav>

        <div
          className={`sys-status sys-${backendOnline === null ? "checking" : backendOnline ? "online" : "offline"}`}
          role="status"
        >
          <span className="sys-dot" aria-hidden="true" />
          <div>
            <strong>{backendOnline === null ? "Checking models…" : backendOnline ? "Models online" : "Service offline"}</strong>
            <span>{backendOnline === false ? "Can't reach the prediction service" : "Hybrid quantum + ML ready"}</span>
          </div>
        </div>

        <div className="user-profile">
          <div className="avatar">{authData.username.charAt(0).toUpperCase() || "D"}</div>
          <div className="user-info">
            <p className="u-name">{authData.username || "User Account"}</p>
            <p className="u-role">{role === "admin" ? "System Administrator" : "Patient"}</p>
          </div>
          <button onClick={requestLogout} className="logout-btn" title="Sign out" aria-label="Sign out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      {/* SIGN OUT CONFIRMATION POPUP */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={cancelLogout}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Sign out?</h3>
            <p>You'll need your username/ID and password to sign back in.</p>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-ghost" onClick={cancelLogout}>No, stay</button>
              <button className="modal-btn modal-btn-danger" onClick={handleLogout}>Yes, sign out</button>
            </div>
          </div>
        </div>
      )}

      {/* SHAP EXPLANATION MODAL */}
      {showShapModal && (
        <div className="modal-overlay" onClick={() => setShowShapModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h3>SHAP Model Explanation</h3>
            <p style={{ marginTop: '0.5rem', marginBottom: '1rem', color: 'var(--hiq-muted)', lineHeight: '1.4' }}>
              This plot explains how each feature impacts the model's output for this specific patient. 
              Features pushing the prediction higher are shown in red, and those pushing it lower are in blue.
            </p>
            
            {/* Hardcoded Diabetes SHAP Example */}
            <div style={{ backgroundColor: 'var(--bg-main)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <span style={{ color: 'var(--hiq-danger)' }}>2-Hour Glucose (168)</span>
                <span style={{ color: 'var(--hiq-danger)' }}>+14.2%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <span style={{ color: 'var(--hiq-danger)' }}>BMI (33.2)</span>
                <span style={{ color: 'var(--hiq-danger)' }}>+8.5%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <span style={{ color: 'var(--hiq-danger)' }}>Age (45)</span>
                <span style={{ color: 'var(--hiq-danger)' }}>+3.1%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <span style={{ color: 'var(--hiq-success)' }}>Blood Pressure (70)</span>
                <span style={{ color: 'var(--hiq-success)' }}>-1.2%</span>
              </div>
              <hr style={{ borderColor: 'var(--border-color)', margin: '0.8rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>Base Value</span>
                <span>31.0%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '0.4rem' }}>
                <span>Final Risk Score</span>
                <span>55.6%</span>
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="modal-btn modal-btn-ghost" onClick={() => setShowShapModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="main-content">

        {/* ===================================================================
            PATIENT DASHBOARD (HOME)
           =================================================================== */}
        {role === "user" && activeTab === "dashboard" && (
          <div className="tab-container">
            <GreetingHeader
              username={authData.username}
              latest={latest}
              count={patients.length}
              onNewPrediction={() => setActiveTab("screening")}
            />

            <div className="grid-3col hiq-stat-row">
              <div className="stat-card">
                <span className="stat-icon stat-icon-blue"><Icon name="heart" size={22} /></span>
                <div>
                  <p className="stat-label">Latest Prediction</p>
                  <p className="stat-value">{latest ? `${latest.priority} risk` : "No data yet"}</p>
                  <span className="stat-sub">{latest ? (latest.patientName || latest.name) : "Run a prediction to begin"}</span>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon stat-icon-green"><Icon name="chart" size={22} /></span>
                <div>
                  <p className="stat-label">Risk Score</p>
                  <p className="stat-value">{latest ? <CountUp value={latest.riskScore} suffix="%" /> : "—"}</p>
                  <span className="stat-sub">{latest ? `${latest.priority} Risk` : "Awaiting first screening"}</span>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon stat-icon-purple"><Icon name="calendar" size={22} /></span>
                <div>
                  <p className="stat-label">Last Assessment</p>
                  <p className="stat-value">{latest ? latest.id : "—"}</p>
                  <button className="stat-link" onClick={() => setActiveTab("userhistory")}>View Details</button>
                </div>
              </div>
            </div>

            <div className="grid-2col hiq-bottom-row">
              <div className="card-panel chart-card">
                <h2>Risk History</h2>
                <RiskHistoryChart patients={patients} onSelect={handleViewReport} />
              </div>

              <div className="card-panel">
                <div className="panel-head-row">
                  <h2>Recent Assessments</h2>
                  <button className="stat-link" onClick={() => setActiveTab("userhistory")}>View All</button>
                </div>
                <ul className="recent-list">
                  {patients.slice(0, 4).map(p => (
                    <li key={p.id} className="recent-item" onClick={() => handleViewReport(p)}>
                      <span className={`recent-dot dot-${(p.priority || "low").toLowerCase()}`} />
                      <div className="recent-info">
                        <strong>{p.patientName || p.name}</strong>
                        <span className="sub-text">{p.id} &middot; {p.priority} Risk</span>
                      </div>
                      <span className="score-pill">{p.riskScore}%</span>
                    </li>
                  ))}
                  {patients.length === 0 && <p className="sub-text">No assessments recorded yet.</p>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            NEW PREDICTION (form + results)
           =================================================================== */}
        {role === "user" && activeTab === "screening" && (
          <div className="tab-container">
            <header className="page-header">
              <h1>Disease Prediction</h1>
              <p>Fill in the details below to get an early risk analysis.</p>
            </header>

            <div className="grid-2col">
              <div className="card-panel">
                <h2>Personal &amp; Clinical Information</h2>
                <form onSubmit={handleCalculateRisk} className="intake-form">
                  <div className="form-group form-group-divided">
                    <label>Disease Type</label>
                    <select
                      value={selectedDisease}
                      onChange={(e) => {
                        setSelectedDisease(e.target.value);
                        setCalculatedRisk(null);
                        setRiskError("");
                      }}
                    >
                      {Object.entries(diseases).map(([key, info]) => (
                        <option key={key} value={key}>{info.label}</option>
                      ))}
                    </select>
                  </div>

                  {samplePatients.length > 0 && (
                    <div className="form-group form-group-divided">
                      <label>Load Sample Patient (Optional)</label>
                      <select onChange={handleSampleSelect} defaultValue="">
                        <option value="" disabled>-- Select a pre-loaded case --</option>
                        {samplePatients.map(sp => (
                          <option key={sp.id} value={sp.id}>{sp.name} ({sp.label})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Patient ID / Name</label>
                    <input type="text" name="patientName" required placeholder="Jane Doe" value={formData.patientName} onChange={handleFormChange} />
                  </div>

                  <p className="form-section-title">Clinical measurements</p>

                  {selectedDisease === "breast_cancer" && (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Worst Concave Points</label>
                          <input type="number" step="0.0001" name="worst_concave_points" value={formData.worst_concave_points} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                          <label>Mean Concave Points</label>
                          <input type="number" step="0.0001" name="mean_concave_points" value={formData.mean_concave_points} onChange={handleFormChange} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Worst Radius</label>
                          <input type="number" step="0.01" name="worst_radius" value={formData.worst_radius} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                          <label>Worst Perimeter</label>
                          <input type="number" step="0.01" name="worst_perimeter" value={formData.worst_perimeter} onChange={handleFormChange} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Mean Area</label>
                          <input type="number" step="0.1" name="mean_area" value={formData.mean_area} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                          <label>Mean Texture</label>
                          <input type="number" step="0.01" name="mean_texture" value={formData.mean_texture} onChange={handleFormChange} />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedDisease === "diabetes" && (
                    <>
                      <p className="sub-text" style={{ marginBottom: "10px", fontStyle: "italic" }}>
                        Note: this model was trained on female patients aged 21+ and is not meant for men or children.
                      </p>
                      <div className="form-row">
                        <div className="form-group">
                          <label>2-hour glucose (after glucose tolerance test) (mg/dL)</label>
                          <input type="number" step="1" name="glucose" required value={formData.glucose} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                          <label>Age (years)</label>
                          <input type="number" step="1" name="age" required value={formData.age} onChange={handleFormChange} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Height (cm)</label>
                          <input type="number" step="1" name="height_cm" required value={formData.height_cm} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                          <label>Weight (kg)</label>
                          <input type="number" step="0.1" name="weight_kg" required value={formData.weight_kg} onChange={handleFormChange} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Diastolic blood pressure (mmHg)</label>
                          <input type="number" step="1" name="blood_pressure" required value={formData.blood_pressure} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                          <label>2-hour serum insulin (µU/ml) (Optional)</label>
                          <input type="number" step="1" name="insulin" value={formData.insulin} onChange={handleFormChange} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label title="This mapping is our own demo approximation, not a clinical scale">
                          Family history of diabetes <Icon name="info" size={14} className="icon-inline" />
                        </label>
                        <select name="diabetes_pedigree" value={formData.diabetes_pedigree} onChange={handleFormChange}>
                          <option value="0.24">No known family history</option>
                          <option value="0.37">One relative with diabetes</option>
                          <option value="0.63">Multiple close relatives</option>
                        </select>
                      </div>
                    </>
                  )}

                  <button type="submit" className="action-btn run-btn" disabled={isCalculating}>
                    {isCalculating
                      ? <>Analyzing…</>
                      : <><Icon name="bolt" size={18} className="icon-inline" /> Run Early Detection</>}
                  </button>
                </form>
              </div>

              <div className="card-panel result-panel">
                <h2>Diagnostic Output</h2>
                {riskError && <p className="auth-error">{riskError}</p>}
                {isCalculating ? (
                  <div className="riskmeter-wrapper">
                    <div className="riskmeter-ring">
                      <div className="riskmeter-inner">
                        <span className="riskmeter-pct">…</span>
                      </div>
                    </div>
                    <p className="riskmeter-label">Analyzing biomarkers &amp; imaging data through the hybrid quantum model…</p>
                  </div>
                ) : calculatedRisk ? (
                  <div className="results-wrapper">
                    <div className="grid-2col gauge-row" style={{ gap: '1rem', marginBottom: '1rem' }}>
                      <div className={`gauge-container priority-${calculatedRisk.priority.toLowerCase()}`}>
                        <div className="gauge-score"><CountUp value={calculatedRisk.riskScore} suffix="%" duration={1100} /></div>
                        <div className="gauge-label">Hybrid Quantum+ML Risk</div>
                      </div>
                      <div className="gauge-container" style={{ borderColor: 'var(--border-color)' }}>
                        <div className="gauge-score" style={{ color: 'var(--text-main)' }}><CountUp value={calculatedRisk.classicalRiskScore} suffix="%" duration={1100} /></div>
                        <div className="gauge-label">Classical SVM Baseline</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                      <strong className={`status-badge badge-${calculatedRisk.priority.toLowerCase()}`}>
                        {calculatedRisk.priority} Priority Case
                      </strong>
                      {calculatedRisk.modelsAgree !== undefined && (
                        <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.85rem', color: calculatedRisk.modelsAgree ? 'var(--hiq-success)' : 'var(--hiq-warning)' }}>
                          {calculatedRisk.modelsAgree
                            ? <><Icon name="check" size={14} className="icon-inline" /> Both models agree</>
                            : <><Icon name="alert" size={14} className="icon-inline" /> Models disagree</>}
                        </span>
                      )}
                    </div>

                    {calculatedRisk.imputed_features && calculatedRisk.imputed_features.length > 0 && (
                      <div className="auth-error" style={{ backgroundColor: "var(--hiq-card-hover)", color: "var(--text-main)", marginBottom: "1.25rem", textAlign: "left", padding: "0.8rem", borderRadius: "8px", lineHeight: "1.4" }}>
                        <Icon name="info" size={15} className="icon-inline" style={{ color: "var(--hiq-warning)" }} /> <strong>Note:</strong> The following features were left blank and estimated from dataset median:
                        <span style={{ color: "var(--hiq-muted)" }}> {calculatedRisk.imputed_features.map(f => featureLabelMap[f] || f).join(', ')}</span>
                      </div>
                    )}

                    {calculatedRisk.explanation && calculatedRisk.explanation.length > 0 ? (
                      <div className="factor-list">
                        <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.75rem", color: "var(--hiq-muted)", marginBottom: "0.5rem" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hiq-danger)" }}></span> Raises risk</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hiq-success)" }}></span> Lowers risk</span>
                        </div>
                        {calculatedRisk.explanation
                          .map(f => ({
                            ...f,
                            displayLabel: f.related_features.map(raw => featureLabelMap[raw] || raw).join(" / ")
                          }))
                          .filter((f, index, self) =>
                            self.findIndex(t => t.displayLabel === f.displayLabel) === index
                          )
                          .slice(0, 3)
                          .map((f, i) => (
                            <div className="factor-row" key={i}>
                              <span title={f.displayLabel}>{f.displayLabel}</span>
                              <div className="factor-track">
                                <div
                                  className={`factor-fill ${f.direction === "raises risk" ? "fill-high" : "fill-low"}`}
                                  style={{ width: `${Math.min(95, Math.max(10, Math.abs(f.impact) * 300))}%` }}
                                />
                              </div>
                            </div>
                          ))}

                      </div>
                    ) : (
                      <div className="factor-list">
                        <div className="factor-row">
                          <span>Worst Concave Points</span>
                          <div className="factor-track"><div className="factor-fill fill-high" style={{ width: calculatedRisk.worst_concave_points > 0.1 ? "85%" : "20%" }} /></div>
                        </div>
                        <div className="factor-row">
                          <span>Mean Area</span>
                          <div className="factor-track"><div className="factor-fill fill-mod" style={{ width: calculatedRisk.mean_area > 800 ? "70%" : "18%" }} /></div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                      <button className="save-btn" onClick={handleSaveToQueue} disabled={calculatedRisk.saved} style={{ flex: 1 }}>
                        {calculatedRisk.saved
                          ? <><Icon name="check" size={16} className="icon-inline" /> Saved</>
                          : <><Icon name="plus" size={16} className="icon-inline" /> Save to Patient File</>}
                      </button>
                      <button className="save-btn" onClick={(e) => { e.preventDefault(); setShowShapModal(true); }} style={{ flex: 1, backgroundColor: 'var(--hiq-purple)' }}>
                        <Icon name="search" size={16} className="icon-inline" /> SHAP Explain
                      </button>
                    </div>
                  </div>
                ) : (
                  !riskError && (
                    <div className="empty-state empty-state-rich">
                      <div className="empty-orb"><Icon name="bolt" size={30} /></div>
                      <h3>Ready when you are</h3>
                      <p>Input patient data to compute the hybrid quantum risk classification.</p>
                      <ol className="empty-steps">
                        <li><span>1</span> Choose a disease type</li>
                        <li><span>2</span> Enter details or load a sample patient</li>
                        <li><span>3</span> Run Early Detection</li>
                      </ol>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            HISTORY (user)
           =================================================================== */}
        {role === "user" && activeTab === "userhistory" && (
          <div className="tab-container">
            <header className="page-header">
              <h1>Prediction History</h1>
              <p>View your past assessments and results.</p>
            </header>
            <div className="card-panel">
              <table className={`queue-table ${settings.compactTable ? "compact" : ""}`}>
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Patient</th>
                    <th>Risk Score</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p, i) => (
                    <tr key={p.id} style={{ "--i": i }}>
                      <td className="font-mono">{p.id}</td>
                      <td><strong>{p.patientName || p.name}</strong></td>
                      <td><span className="score-pill">{p.riskScore}%</span></td>
                      <td><span className={`status-badge badge-${(p.priority || "low").toLowerCase()}`}>{p.priority || "Low"}</span></td>
                      <td><button className="link-btn" onClick={() => handleViewReport(p)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {patients.length === 0 && <p className="sub-text">No history yet — run a prediction first.</p>}
            </div>
          </div>
        )}

        {/* ===================================================================
            REPORTS (user)
           =================================================================== */}
        {(activeTab === "reports") && (
          <div className="tab-container">
            <header className="page-header">
              <h1>Patient Report</h1>
              <p>Generated summary for informational purposes.</p>
            </header>

            {reportSource ? (
              <div className="card-panel report-card">
                {/* Letterhead: only visible when printing / saving as PDF */}
                <div className="print-only report-letterhead">
                  <div className="letterhead-brand">
                    <FlowerLogo size={48} />
                    <div>
                      <strong>QureML</strong>
                      <span>Hybrid quantum-classical clinical risk screening</span>
                    </div>
                  </div>
                  <dl className="letterhead-meta">
                    <div><dt>Record</dt><dd>{reportSource.id}</dd></div>
                    <div>
                      <dt>Screening</dt>
                      <dd>{(reportSource.diseaseType === "diabetes" || String(reportSource.id || "").startsWith("DB-")) ? "Diabetes risk screening" : "Breast cancer risk screening"}</dd>
                    </div>
                    <div><dt>Generated</dt><dd>{new Date().toLocaleString()}</dd></div>
                  </dl>
                </div>

                <div className="report-head">
                  <div>
                    <p className="stat-label">Patient Details</p>
                    <h2>{reportSource.patientName || reportSource.name}</h2>
                  </div>
                  <div className="report-actions">
                    <button
                      className="action-btn report-print-btn"
                      onClick={() => printReport(`QureML-Report-${reportSource.id}-${reportSource.patientName || reportSource.name || "Patient"}`)}
                      title="Opens the print dialog. Choose 'Save as PDF' as the destination."
                    >
                      <Icon name="download" size={16} className="icon-inline" /> Download PDF
                    </button>
                    <span className="report-print-hint">Choose “Save as PDF” in the dialog</span>
                  </div>
                </div>

                <div className="grid-3col">
                  <div className={`info-box info-${String(reportSource.priority || "low").toLowerCase()}`}>
                    <h3>Diagnosis</h3>
                    <p className="highlight-text">{reportSource.priority} Risk</p>
                    <p className="sub-text">Model Used: Hybrid ML + Quantum</p>
                  </div>
                  <div className={`info-box info-${String(reportSource.priority || "low").toLowerCase()}`}>
                    <h3>Risk Score</h3>
                    <p className="highlight-text"><CountUp value={reportSource.riskScore} suffix="%" /></p>
                    <p className="sub-text">Record {reportSource.id}</p>
                  </div>
                  <div className="info-box">
                    <h3>Survival Estimate</h3>
                    <p className="highlight-text">{reportSource.survivalRate || "—"}</p>
                    <p className="sub-text">5-year projection</p>
                  </div>
                </div>

                <ReportSections patient={reportSource} labelMap={featureLabelMap} />

                <div className="report-footer">
                  This report is generated for informational purposes only. Please consult a healthcare professional for a proper diagnosis and treatment.
                </div>
              </div>
            ) : (
              <div className="card-panel empty-state">
                <p>No prediction data yet. Run a new prediction to generate a report.</p>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            ADMINISTRATOR PAGES
           =================================================================== */}

        {/* DOCTOR DASHBOARD (admin home) */}
        {role === "admin" && activeTab === "dashboard" && (
          <div className="tab-container">
            <header className="page-header">
              <h1>Doctor Dashboard</h1>
              <p>Monitor patients and high-risk cases.</p>
            </header>

            <div className="grid-3col hiq-stat-row">
              <div className="stat-card">
                <span className="stat-icon stat-icon-blue"><Icon name="users" size={22} /></span>
                <div>
                  <p className="stat-label">Total Patients</p>
                  <p className="stat-value"><CountUp value={totalPatients} /></p>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon stat-icon-red"><Icon name="alert" size={22} /></span>
                <div>
                  <p className="stat-label">High-Risk Cases</p>
                  <p className="stat-value"><CountUp value={highCount} /></p>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon stat-icon-purple"><Icon name="trend" size={22} /></span>
                <div>
                  <p className="stat-label">Avg. Risk Score</p>
                  <p className="stat-value"><CountUp value={avgRisk} suffix="%" /></p>
                </div>
              </div>
            </div>

            <div className="grid-2col hiq-bottom-row">
              <div className="card-panel">
                <h2>Risk Distribution</h2>
                <div className="donut-wrap">
                  <div className="donut" style={donutStyle}>
                    <div className="donut-hole">
                      <strong><CountUp value={totalPatients} /></strong>
                      <span>Patients</span>
                    </div>
                  </div>
                  <ul className="donut-legend">
                    <li><span className="dot dot-high" /> High {highPct}%</li>
                    <li><span className="dot dot-moderate" /> Moderate {modPct}%</li>
                    <li><span className="dot dot-low" /> Low {lowPct}%</li>
                  </ul>
                </div>
              </div>

              <div className="card-panel">
                <h2>Recent High-Risk Patients</h2>
                <table className="queue-table compact">
                  <thead>
                    <tr><th>Patient</th><th>Risk</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {patients.filter(p => p.priority === "High").slice(0, 5).map((p, i) => (
                      <tr key={p.id} style={{ "--i": i }}>
                        <td><strong>{p.patientName || p.name}</strong></td>
                        <td><span className="score-pill">{p.riskScore}%</span></td>
                        <td><button className="link-btn" onClick={() => handleViewReport(p)}>View</button></td>
                      </tr>
                    ))}
                    {highCount === 0 && <tr><td colSpan="3" className="sub-text">No high-risk patients currently.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PAGE A1: DATABASE & QUEUE */}
        {role === "admin" && activeTab === "database" && (
          <div className="tab-container">
            <header className="page-header">
              <h1>Patient Records &amp; Priority Database</h1>
              <p>System-wide database management and clinical triage control.</p>
            </header>

            <div className="card-panel">
              <div className="table-controls">
                <div className="filter-group">
                  <label>Filter Priority: </label>
                  <button className={queueFilter === "All" ? "active" : ""} onClick={() => setQueueFilter("All")}>All ({patients.length})</button>
                  <button className={queueFilter === "High" ? "active" : ""} onClick={() => setQueueFilter("High")}>High Priority</button>
                  <button className={queueFilter === "Moderate" ? "active" : ""} onClick={() => setQueueFilter("Moderate")}>Moderate</button>
                  <button className={queueFilter === "Low" ? "active" : ""} onClick={() => setQueueFilter("Low")}>Low</button>
                </div>
              </div>

              <table className={`queue-table ${settings.compactTable ? "compact" : ""}`}>
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Patient Name</th>
                    <th>Mean Area</th>
                    <th>Worst Radius</th>
                    <th>Risk Score</th>
                    <th>Priority</th>
                    <th>Admin Actions</th>
                  </tr>
                </thead>
                <tbody key={queueFilter}>
                  {filteredPatients.map((p, i) => (
                    <tr key={p.id} style={{ "--i": i }}>
                      <td className="font-mono">{p.id}</td>
                      <td><strong>{p.patientName || p.name}</strong></td>
                      <td>{p.mean_area}</td>
                      <td>{p.worst_radius}</td>
                      <td><span className="score-pill">{p.riskScore}%</span></td>
                      <td>
                        <span className={`status-badge badge-${(p.priority || "low").toLowerCase()}`}>
                          {p.priority || "Low"}
                        </span>
                      </td>
                      <td className="row-actions">
                        <button className="link-btn" onClick={() => handleViewReport(p)}>Report</button>
                        <button className="del-btn" onClick={() => handleDeletePatient(p.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAGE A2: QUANTUM BENCHMARKS */}
        {role === "admin" && activeTab === "benchmarks" && (
          <div className="tab-container">
            <header className="page-header">
              <h1>Hybrid Quantum+ML Benchmarks</h1>
              <p>Honest comparison between the hybrid pipeline and the classical baseline.</p>
            </header>
            <div className="grid-2col">
              <div className="metric-card">
                <h3>Hybrid Model (Quantum+XGBoost)</h3>
                <p className="metric-val">{modelMetrics ? <CountUp value={modelMetrics.hybridAccuracy * 100} decimals={1} suffix="% Accuracy" duration={1300} /> : <span className="skeleton-line" />}</p>
                {modelMetrics && <div className="bench-bar"><span style={{ "--w": `${modelMetrics.hybridAccuracy * 100}%` }} /></div>}
                <span className="metric-sub">Quantum Feature Map → XGBoost · 4 qubits · 3 StronglyEntanglingLayers</span>
                {modelMetrics && (
                  <div className="metric-extras">
                    <span className="metric-sub">F1: {(modelMetrics.hybridF1 * 100).toFixed(1)}% · ROC-AUC: {(modelMetrics.hybridRocAuc * 100).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <div className="metric-card">
                <h3>Classical Baseline (RBF SVM)</h3>
                <p className="metric-val">{modelMetrics ? <CountUp value={modelMetrics.classicalAccuracy * 100} decimals={1} suffix="% Accuracy" duration={1300} /> : <span className="skeleton-line" />}</p>
                {modelMetrics && <div className="bench-bar bench-bar-alt"><span style={{ "--w": `${modelMetrics.classicalAccuracy * 100}%` }} /></div>}
                <span className="metric-sub">Same PCA features, no quantum step</span>
              </div>
            </div>
            <div className="card-panel" style={{ marginTop: '1.5rem' }}>
              <h2>Pipeline Architecture</h2>
              <div className="pipeline-flow" aria-label="Pipeline: Scaler, PCA, Quantum feature map, XGBoost">
                {["StandardScaler", "PCA (6 to 4)", "Quantum feature map", "XGBoost"].map((step, i) => (
                  <div className="pipeline-step" key={step} style={{ "--i": i }}>
                    <span className="pipeline-node">{step}</span>
                  </div>
                ))}
              </div>
              <p className="sub-text">The hybrid model uses a quantum circuit as a feature transformer (not a standalone classifier). The quantum circuit applies AngleEmbedding(Y) + StronglyEntanglingLayers with fixed weights, measuring expval(PauliZ) on all 4 qubits. These quantum-transformed features are then classified by XGBoost.</p>
              <p className="sub-text" style={{ marginTop: '0.5rem' }}>The classical baseline deliberately uses RBF-SVM (not XGBoost) so the only variable that differs is the quantum feature transformation step.</p>
            </div>
          </div>
        )}

        {/* PAGE A3: AUDIT LOGS */}
        {role === "admin" && activeTab === "logs" && (
          <div className="tab-container">
            <header className="page-header">
              <h1>System Audit &amp; Activity Logs</h1>
              <p><span className="live-dot" aria-hidden="true" /> Real-time security logs, login records, and operational traces.</p>
            </header>

            <div className="card-panel">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Log ID</th>
                    <th>User ID</th>
                    <th>Action Performed</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={log.id} style={{ "--i": i }} className={i === 0 ? "log-newest" : ""}>
                      <td className="font-mono">{log.id}</td>
                      <td><strong>{log.user}</strong></td>
                      <td>{log.action}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{log.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAGE: SETTINGS (both roles) */}
        {activeTab === "settings" && (
          <div className="tab-container">
            <SettingsPage
              settings={settings}
              onSettingChange={handleSettingChange}
              username={authData.username}
              role={role}
              accountId={currentAccountId}
              onChangePassword={changePasswordRequest}
              onSignOut={requestLogout}
            />
          </div>
        )}

        {activeTab === "imagescreen" && (
          <div className="tab-container">
            <ImageScreening />
          </div>
        )}

      </main>
    </div>
  );
}
