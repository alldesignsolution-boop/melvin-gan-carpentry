# Melvin HQ on Railway

Private overview for Hoga Space, Hankidz, Digital Ads Service and redpacket.my. This replaces the old website in the existing repository while preserving its Git history and Railway volume.

The React interface is hosted on Railway. Existing HQ records remain in the private Sites application's D1 storage; the existing Railway hourly job continues updating that same store. Private reminders and review state are shared between both HQ addresses. Business source dashboards are still read-only sources. The removed Tasks from Melvin feature stays removed.

## Authentication and storage

Sign in using the existing Railway service's `ADMIN_USER` and `ADMIN_PASS`. The new `HQ_SESSION_SECRET` signs an eight-hour HttpOnly, Secure, SameSite=Strict session. No default credentials exist in this application. Failed sign-ins are rate limited. All dashboard assets and APIs require authentication; writes require the configured origin and JSON content type.

Only `/api/hq` and `/api/imap` are relayed, with a server-held `HQ_BACKEND_ACCESS_TOKEN` for the private Sites boundary and an independent `HQ_PORTAL_SECRET` for the narrowly scoped owner API. Browser credentials and identity headers are never forwarded. The backend resolves the existing unique record owner and fails closed if ownership is ambiguous. No customer data is bundled or logged. OAuth authorization continues on the original owner-private Sites application, where registered callbacks remain unchanged.

## Runtime configuration

- Existing `ADMIN_USER`, `ADMIN_PASS` are preserved.
- `HQ_SESSION_SECRET`, `HQ_BACKEND_ACCESS_TOKEN`, `HQ_PORTAL_SECRET` are secret Railway variables.
- `PUBLIC_ORIGIN=https://melvin-hq.up.railway.app`.
- The backend origin is fixed to the existing private Melvin HQ Site.
- Bind to `0.0.0.0` and Railway's `PORT` (default 8080).

No data migration or new database is needed. The previous application's volume at `/app/data` is left intact for recovery; this portal never opens it. Original code remains recoverable in Git history. Existing Hoga and Hankidz business services are unchanged.

## Development and deployment

Node 22.13+. Run `npm ci`, `npm run build`, `npm test`. Start with `npm start` and private environment variables. Tests use temporary files and synthetic backend data, never production record writes.

Push to the existing repository's main branch first. Railway follows that branch automatically. Verify the deployment commit matches the pushed SHA and `/health` succeeds, then verify sign-in and read-only HQ loading. Keep `.env*`, customer exports, databases and node_modules out of Git.

Original Sites UI source used for this port: `3fd1391d01b643cc370a77126ccf3b08cf19cbb4`. Public code contains no account credentials or business records. The repository retains its existing visibility.

## HQ service organization

The Railway project is named Melvin HQ. Its website, hourly sync and private email bridge belong together in production. The two functions have been moved out of the Hoga project. Their deployed source is tracked in `infrastructure/hourly-sync.ts` and `infrastructure/mail-bridge.ts`; the original sync modules also remain in the Sites source repository. Credentials stay in server variables and never enter Git. The mail bridge retains the private endpoint `melvin-hq-mail.railway.internal:3000`. The sync runs at `0 * * * *` and keeps the existing Sites data destination. Hoga keeps its CRM and persistent database in its own project.
