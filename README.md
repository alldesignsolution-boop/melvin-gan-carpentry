# Melvin HQ on Railway

Private overview for Hoga Space, Hankidz, Digital Ads Service and redpacket.my. This replaces the old website in the existing repository while preserving its Git history and Railway volume.

The React interface is hosted on Railway. Existing HQ records (brand summaries, mail, review state) remain in the private Sites application's D1 storage; the existing Railway hourly job continues updating that same store. Business source dashboards are still read-only sources. The Follow-ups & reminders page has been removed; saved reminders stay in the Sites store but are no longer shown.

## Pages

- **Today**: new leads, to-dos due this week, latest leads, client shortcuts and brand cards.
- **Leads**: a Trello-style board (New → Contacted → Qualified → Proposal → Onboarded / Lost). Cards have labels, a to-do checklist, contact buttons, shortcuts, comments and an activity log. Drag cards between lists.
- **Clients**: every lead in Onboarded gets its own dashboard at `#/clients/<id>` with shortcut tiles (keys 1–9), checklist progress, notes and activity.
- **Performance**, **Inbox**, **Connections**: unchanged brand data from the Sites store; Connections also shows ManyChat intake status.
- Press `Ctrl K` (or `/`) anywhere to jump to a page, lead or client.

## Leads store and ManyChat intake

Leads, labels, to-dos and activity are owned by this Railway service in SQLite (`node:sqlite`) at `$RAILWAY_VOLUME_MOUNT_PATH/melvin-crm.sqlite` (override with `HQ_DATA_DIR`; locally `./.data`). It is a new file beside the old application's data, which is left untouched.

ManyChat posts contacts to `POST /api/manychat?brand=<hoga|digitalads|hankidz|redpacket>` using an External Request action with header `X-HQ-Key: <MANYCHAT_WEBHOOK_SECRET>` and body "Add Full Contact Data". Intake is off until `MANYCHAT_WEBHOOK_SECRET` (24+ characters) is set. Contacts are upserted by ManyChat ID, then by phone within the brand; ManyChat tags become labels, `live_chat_url` becomes a shortcut, custom fields are kept on the card, and the last message goes to the activity log. The board API is `/api/crm` (session, same-origin JSON writes only).

## Authentication and storage

Sign in using the existing Railway service's `ADMIN_USER` and `ADMIN_PASS`. The new `HQ_SESSION_SECRET` signs an eight-hour HttpOnly, Secure, SameSite=Strict session. No default credentials exist in this application. Failed sign-ins are rate limited. All dashboard assets and APIs require authentication; writes require the configured origin and JSON content type.

Only `/api/hq` and `/api/imap` are relayed, with a server-held `HQ_BACKEND_ACCESS_TOKEN` for the private Sites boundary and an independent `HQ_PORTAL_SECRET` for the narrowly scoped owner API. Browser credentials and identity headers are never forwarded. The backend resolves the existing unique record owner and fails closed if ownership is ambiguous. No customer data is bundled or logged. OAuth authorization continues on the original owner-private Sites application, where registered callbacks remain unchanged.

## Runtime configuration

- Existing `ADMIN_USER`, `ADMIN_PASS` are preserved.
- `HQ_SESSION_SECRET`, `HQ_BACKEND_ACCESS_TOKEN`, `HQ_PORTAL_SECRET` and `MANYCHAT_WEBHOOK_SECRET` are secret Railway variables.
- `PUBLIC_ORIGIN=https://melvin-hq.up.railway.app`.
- The backend origin is fixed to the existing private Melvin HQ Site.
- Bind to `0.0.0.0` and Railway's `PORT` (default 8080).

The previous application's files on the `/app/data` volume are left intact for recovery; the portal only adds `melvin-crm.sqlite` beside them. Original code remains recoverable in Git history. Existing Hoga and Hankidz business services are unchanged.

## Development and deployment

Node 22.13+. Run `npm ci`, `npm run build`, `npm test`. Start with `npm start` and private environment variables. Tests use temporary files and synthetic backend data, never production record writes.

Push to the existing repository's main branch first. Railway follows that branch automatically. Verify the deployment commit matches the pushed SHA and `/health` succeeds, then verify sign-in and read-only HQ loading. Keep `.env*`, customer exports, databases and node_modules out of Git.

Original Sites UI source used for this port: `3fd1391d01b643cc370a77126ccf3b08cf19cbb4`. Public code contains no account credentials or business records. The repository retains its existing visibility.

## HQ service organization

The Railway project is named Melvin HQ. Its website, hourly sync and private email bridge belong together in production. The two functions have been moved out of the Hoga project. Their deployed source is tracked in `infrastructure/hourly-sync.ts` and `infrastructure/mail-bridge.ts`; the original sync modules also remain in the Sites source repository. Credentials stay in server variables and never enter Git. The mail bridge retains the private endpoint `melvin-hq-mail.railway.internal:3000`. The sync runs at `0 * * * *` and keeps the existing Sites data destination. Hoga keeps its CRM and persistent database in its own project.
