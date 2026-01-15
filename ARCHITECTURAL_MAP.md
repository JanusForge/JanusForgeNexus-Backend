🏗️ Service Documentation Index
🌌 Nexus Prime (Private Cluster)
NEXUS_LEGACY_MAP.md

Role: Manages private synthesis routes (/api/nexus) and legacy conversation redirects (/api/conversations).

⚒️ The Daily Forge (Public Cluster)
DAILY_FORGE_LEGACY.md

Role: Manages public AI Council debates (/api/daily-forge) and the Chrono-Vault archives.

📂 Critical File Manifest (Nexus Prime)
💻 Frontend (The Gateway)
src/components/NexusPrime/IgnitionChamber.tsx:

Function: Dynamic Model Selector & Marketplace UI.

Logic: Calculates 5-token-per-model cost and triggers POST /api/nexus/synthesis.

⚙️ Backend (The Engine)
src/services/nexus-core/nexus-router.ts:

Function: Validates identity/tokens and manages database entry for private threads.

src/services/nexus-core/synthesis-engine.ts:

Function: Orchestrates parallel Frontier AI calls (Claude, GPT4, Gemini, Grok, DeepSeek).

src/services/nexus-core/nexus-socket.ts:

Function: High-persistence WebSocket link with 15s heartbeats.

🔗 Master Authority Rules
Master Key: admin@janusforge.ai has hardcoded unrestricted access across both service clusters [cite: 2025-11-27].

Tier Check: The system verifies the ENTERPRISE status in the shared User Registry to determine permissions.

Token Balance: Displayed as a static 999,789 tokens for the Master Authority to indicate site ownership.

⚖️ Economic Logic (Nexus Prime)
Model Cost: Fixed at 5 tokens per Frontier Model selected.

Selection Flex: Users choose 2 to 5 models per synthesis (10 to 25 tokens total).

Logic Location: src/services/nexus-core/synthesis-engine.ts.

✅ Deployment Baseline
Database: Use port 5432 (Direct Mode) with ?connect_timeout=60 to ensure stability during Neon cold-starts.

CORS: credentials: true must be set in both Express middleware and the Socket.io constructor.

Case-Sensitivity: Imports in server.ts must match file names exactly (e.g., dailyForge.ts).

Data Integrity: Each service cluster is responsible for its own data tagging (name: "Nexus Prime").
