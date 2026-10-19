# THEO — Remote Command & AI Workbench PWA

Installable Progressive Web App (PWA) for **THEO** (`bhfirms.theo-hub`), providing remote mobile & desktop command over **Google Antigravity** and **Claude Code** sessions across the BHFIRMS estate.

## Architecture

1. **Direct Local / LAN Bridge (`http://localhost:4318` / `http://<LAN-IP>:4318`)**:
   - Hosted directly inside the VS Code `bhfirms.theo-hub` extension (`remote.js`).
   - Streams real-time state updates via Server-Sent Events (`/api/events`) and exposes `/api/state`, `/api/thread`, `/api/workspace`, `/api/send`, `/api/approve`, and `/api/session-action`.
2. **Zero-VPN Dataverse Cloud Relay Fallback**:
   - Syncs live snapshots, transcripts, quota windows, and remote command queues through the Power Automate HTTP flow `Personal - THEO Remote Cloud Relay` (`fd94ba72-41b7-93a6-b677-6aa1449a90f6`) backed by Dataverse webresource `bhf_theo_remote_store.json` (`c6876327-64cb-f111-a05d-7ced8d748299`).
   - Uses `POST` with `Content-Type: text/plain;charset=UTF-8` for zero CORS preflight from any browser or mobile network worldwide.
3. **Offline-First Storage & Outbox Queue**:
   - Instant startup from `localStorage` snapshot cache (`theo_remote_cache_v1`) + Service Worker (`sw.js`) app-shell caching + automatic Outbox command flushing.
