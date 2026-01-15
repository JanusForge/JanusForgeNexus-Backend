# Janus Forge Nexus Core: Architectural Map

## 🛡️ The Firebreak Protocol
Nexus Prime (Private) and The Daily Forge (Public) are isolated service clusters sharing only the Neon User Registry.

---

## 🏗️ Service Documentation Index

### 🌌 Nexus Prime (Private Cluster)
* **[NEXUS_LEGACY_MAP.md](./src/services/nexus-core/NEXUS_LEGACY_MAP.md)**
  * **Role**: Manages private synthesis routes (`/api/nexus`) and legacy conversation redirects (`/api/conversations`).

### ⚒️ The Daily Forge (Public Cluster)
* **[DAILY_FORGE_LEGACY.md](./src/routes/DAILY_FORGE_LEGACY.md)**
  * **Role**: Manages public AI Council debates (`/api/daily-forge`) and the Chrono-Vault archives.

---

## 🔗 Master Authority Rules
* **Master Key**: `admin@janusforge.ai` has hardcoded unrestricted access across both service clusters [cite: 2025-11-27].
* **Tier Check**: The system verifies the `ENTERPRISE` status in the shared User Registry to determine permissions [cite: 2025-11-27].

---

## ✅ Deployment Baseline
1. DATABASE_URL port must be **:6543**.
2. Case-Sensitive Imports in `server.ts` are mandatory.
3. Each service cluster is responsible for its own data integrity.

___

## ⚖️ Economic Logic (Nexus Prime)
* **Model Cost**: Fixed at 5 tokens per Frontier Model selected.
* **Selection Flex**: Users choose 2 to 5 models per synthesis.
* **Master Authority**: `admin@janusforge.ai` bypasses all costs [cite: 2025-11-27].
* **Logic Location**: `src/services/nexus-core/synthesis-engine.ts`.


