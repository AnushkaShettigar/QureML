# QureML Deployment Prompt (for Antigravity / coding agent)

Copy-paste the block below into your coding agent.

---

I have a project called QureML with this structure:

```
QureML/
├── ml/
│   ├── api.py                  # FastAPI backend
│   ├── train_and_save.py
│   ├── quantum_risk_model.py
│   ├── pca_analysis.py
│   └── artifacts/
├── src/
│   └── App.jsx                 # React frontend
├── package.json
└── (Vite config)
```

Backend: FastAPI + Uvicorn, deployed on Render as a Web Service.
Frontend: React + Vite, deployed on Vercel.

I need these two deployed so they work together in production. Please do the following:

## 1. Backend changes (`ml/api.py`)

- Add CORS middleware using `fastapi.middleware.cors.CORSMiddleware`.
- Allow origins from an environment variable (e.g. `ALLOWED_ORIGIN`), defaulting to `"*"` for now so I can test, but structured so I can lock it down to my Vercel URL later.
- Make sure the app reads the port from the `PORT` environment variable if needed for Render (Render injects `$PORT`).
- Add a `requirements.txt` in the `ml/` folder listing all needed packages: `fastapi`, `uvicorn`, `numpy`, `pandas`, `scikit-learn`, `xgboost`, `pennylane`, `shap`, `joblib`, `pydantic`, `python-multipart` if needed.
- Confirm the start command should be: `uvicorn api:app --host 0.0.0.0 --port $PORT` (run from inside the `ml/` directory).
- Make sure any file paths in `api.py` that load model artifacts (from `ml/artifacts/`) use relative paths that work when the app is run from the `ml/` directory on Render, not just locally.

## 2. Frontend changes (`src/App.jsx` and any other files making API calls)

- Find every place the code calls `http://localhost:8000` (or any hardcoded local backend URL).
- Replace it with an environment variable, e.g. `import.meta.env.VITE_API_URL`, with a fallback to `http://localhost:8000` for local dev.
- Create a `.env` file (and `.env.example`) in the project root with:
  ```
  VITE_API_URL=http://localhost:8000
  ```
- Make sure `.env` is in `.gitignore` but `.env.example` is committed.

## 3. Deployment steps

Walk me through, step by step, exactly what to do (I will do the manual parts myself, like creating accounts and clicking buttons — just tell me precisely what to click/enter):

a) Deploying the FastAPI backend on Render as a Web Service, using the `ml/` folder as the root, with the correct build and start commands.

b) Getting the resulting Render URL and setting it as `VITE_API_URL` in Vercel's project environment variables.

c) Deploying the React frontend on Vercel, confirming Vite is auto-detected and the build command/output directory are correct.

d) After both are live, updating the FastAPI `allow_origins` to the real Vercel URL (not `"*"`) and redeploying the backend.

e) Testing the full flow: submit a patient screening form on the deployed frontend and confirm it gets a real prediction back from the deployed backend, not a CORS or network error.

## 4. Cold start note

Also flag if Render's free tier "cold start" (service sleeping after inactivity) is likely to cause a noticeable delay on first request, and suggest a simple way to warm it up before a live demo (e.g. a script or manual ping a few minutes beforehand).

---

Give me the exact code diffs for steps 1 and 2, then the deployment walkthrough for step 3, then the note for step 4.
