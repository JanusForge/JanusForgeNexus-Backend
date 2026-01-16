# The Daily Forge: Legacy Independence Map

## 🛡️ Firebreak Goal
Transform The Daily Forge into an autonomous public service. This ensures the "Chrono-Vault" and AI Council debates operate without interference from private Nexus Prime synthesis logic.

---

## 🏗️ Path Ownership

### 1. Modern API (Target)
* `GET /api/daily-forge/current` -> Fetches the active daily topic and countdown.
* `GET /api/daily-forge/history` -> Populates the Chrono-Vault sidebar with past debates.
* `POST /api/daily-forge/interject` -> User participation entry point.

### 2. Legacy API (Handled by Forge Core)
* `GET /api/vault` -> Redirected to Daily Forge History.
* `POST /api/council/interject` -> Redirected to Forge Interjection logic.

---

## 🔗 Internal Rules
* **Public Access**: Unlike Nexus Prime, this service is designed for multi-user public viewing.
* **Owner Bypass**: Recognizes `admin@janusforge.ai` as the Master Authority to bypass token costs for interjections [cite: 2025-11-27].
* **Isolation Locking**: This service must not access the "Nexus Prime" conversation threads to prevent data leakage.
