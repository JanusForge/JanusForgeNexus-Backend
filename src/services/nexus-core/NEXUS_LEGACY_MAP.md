# Nexus Prime: Legacy Independence Map

## 🛡️ Firebreak Goal
Transform Nexus Prime into a stand-alone service that handles its own "Legacy" routes. This prevents backend "pollution" where general conversation logic mixes with private Synthesis logic.

---

## 🏗️ Path Ownership

### 1. Modern API (Target)
* `POST /api/nexus/synthesis` -> Primary entry for 5-AI Cluster.
* `GET /api/nexus/history` -> Primary entry for private sidebar.

### 2. Legacy API (Handled by Nexus Core)
* `GET /api/conversations` -> Redirected to Nexus Private History.
* `POST /api/conversations/synthesis` -> Redirected to Nexus Synthesis Ignition.

---

## 🔗 Internal Rules
* **Identity First**: All routes must search for `userId` or `user_id`.
* **Privacy Locking**: Every database entry created via this handler MUST include:
    * `name: "Nexus Prime"`
    * `is_private: true`
* **Admin Privilege**: All routes must recognize `admin@janusforge.ai` as the Master Authority for token bypass [cite: 2025-11-27].
