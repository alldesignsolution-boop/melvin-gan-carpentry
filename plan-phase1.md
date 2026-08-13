# Execution Plan: Melvin Gan Carpentry — Phase 1 (Foundation)

**Date:** 2026-07-01
**Business Line:** 外包项目
**Prepared by:** CEO Agent
**Passes to:** Builder (Claude Code)

---

## Goal

Build a working local web app where the Melvin Gan Carpentry boss can see a live pipeline Dashboard and sales can manage leads — using real migrated data from the existing Excel prospect sheet.

## Success Criteria

- [ ] FastAPI backend runs locally on `http://localhost:8000`
- [ ] SQLite database seeded with leads migrated from `prospect general update` sheet
- [ ] Dashboard shows: new leads count, pipeline funnel, conversion rate, leads by stage
- [ ] Lead list page: filter by status, click to view/edit lead detail
- [ ] Lead status can be manually updated (dropdown, 6 stages)
- [ ] FB Webhook endpoint exists and validates correctly (test with simulated payload)
- [ ] Manual lead entry form works as fallback
- [ ] Password-protected access (HTTP Basic Auth)

---

## Tech Stack

- **Backend:** Python 3.11+ / FastAPI / SQLAlchemy / SQLite
- **Frontend:** Vanilla HTML + Alpine.js (CDN) + Chart.js (CDN)
- **PDF (Phase 2):** WeasyPrint — install now, use later
- **Auth:** HTTP Basic Auth via FastAPI middleware

---

## Project Structure

```
hoga-crm/
├── main.py                  # FastAPI app entry point
├── database.py              # SQLAlchemy setup, DB init
├── models.py                # ORM models
├── routes/
│   ├── leads.py             # CRUD: leads
│   ├── webhook.py           # FB Lead Ads webhook endpoint
│   └── dashboard.py         # Dashboard data API
├── services/
│   └── seed.py              # One-time data migration from Excel
├── frontend/
│   ├── index.html           # Dashboard (boss view)
│   ├── leads.html           # Lead list + filter
│   └── lead_detail.html     # Lead detail + status update
├── data/
│   └── hoga.db              # SQLite (auto-created)
├── requirements.txt
└── .env.example             # Env var template
```

---

## Database Schema

### Table: `leads`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| full_name | TEXT | |
| phone | TEXT | |
| email | TEXT | nullable |
| location | TEXT | property address |
| budget | TEXT | e.g. "30k", "nil" |
| request_notes | TEXT | scope/requirements |
| status | TEXT | enum: new / contacted / quoted / following_up / won / lost |
| assigned_to | TEXT | salesperson name |
| fb_campaign | TEXT | ad source (from webhook) |
| fb_lead_id | TEXT | unique, nullable |
| created_at | DATETIME | |
| updated_at | DATETIME | |
| quote_id | TEXT | FK to quotes table (Phase 2) |

### Table: `status_log`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| lead_id | INTEGER FK | |
| from_status | TEXT | |
| to_status | TEXT | |
| changed_at | DATETIME | |
| note | TEXT | optional comment |

---

## Steps

- [ ] **Step 1:** Set up project folder, `requirements.txt`, `database.py`, `models.py`
  → Deliverable: `pip install -r requirements.txt` runs clean; `python main.py` starts server

- [ ] **Step 2:** Build leads CRUD API (`routes/leads.py`)
  → Deliverable: `POST /leads`, `GET /leads`, `GET /leads/{id}`, `PATCH /leads/{id}/status` all return correct JSON

- [ ] **Step 3:** Build FB Webhook endpoint (`routes/webhook.py`)
  → Deliverable: `GET /webhook` handles verification challenge; `POST /webhook` parses lead payload and creates lead record. Test with curl simulated payload.

- [ ] **Step 4:** Build manual lead entry form + lead list page (`frontend/leads.html`, `frontend/lead_detail.html`)
  → Deliverable: Can add a lead via form, see it in list, update its status from dropdown

- [ ] **Step 5:** Build Dashboard API + page (`routes/dashboard.py`, `frontend/index.html`)
  → Deliverable: Dashboard shows 4 KPI cards + pipeline funnel (Chart.js bar chart) + leads table. All data live from DB.

- [ ] **Step 6:** Seed historical data (`services/seed.py`)
  → Deliverable: Script reads the prospect data below and inserts ~20 historical leads into DB. Run once with `python -m services.seed`

- [ ] **Step 7:** Add HTTP Basic Auth middleware
  → Deliverable: All routes return 401 without correct credentials. Credentials set via `.env`

---

## Historical Data to Migrate (from prospect general update sheet)

Seed these leads. Map status text to standard enum values:
- "waiting customer" / "followed up" → `following_up`
- "quotation send?" / "send quotation" → `quoted`
- "to follow up" / "update?" → `contacted`
- "comparing" → `following_up`
- New/blank → `new`

```
Name: erine | Phone: 60 16-209 6866 | Budget: 35k | Scope: full house makeover | Location: Myara Ara Damansara | Status: following_up
Name: Si Woei | Phone: 60 10-219 0219 | Budget: 30k | Scope: full house makeover | Location: Gem Residences | Status: following_up
Name: misha | Phone: 60 12-686 5120 | Budget: nil | Scope: full house makeover | Status: contacted
Name: Aishwarya | Phone: 60 18-395 5386 | Budget: 20k | Scope: kitchen wardrobe | Status: contacted
Name: ivan teoh | Phone: 60 12-680 4948 | Budget: 27k | Scope: customise package | Status: following_up
Name: Nazrul NZ | Phone: 60 10-231 5512 | Budget: 30k | Scope: full renovation (grille, kitchen, flooring, wardrobes, toilets) | Status: quoted
Name: tony | Phone: 60 16-311 0022 | Scope: studio Astrum Ampang | Status: quoted
Name: lez | Phone: 60 14-324 7649 | Status: quoted
Name: fatboy | Phone: 60 12-396 0518 | Scope: exceed budget | Status: lost
Name: stephanie | Phone: 60 14-914 9342 | Budget: 20k | Scope: kitchen dry+wet | Location: Damansara Perdana | Status: quoted
Name: mr rao | Phone: 60 12-305 3592 | Status: contacted
Name: Siti Asmah | Phone: 60 12-296 1164 | Budget: 15k | Scope: kitchen only | Status: quoted
Name: muzz | Phone: 60 10-262 6861 | Budget: 60k | Scope: full unit | Status: following_up
Name: erna | Phone: 60 19-429 9199 | Scope: full unit | Status: following_up
Name: nurin | Budget: 40k | Scope: full unit | Status: following_up
Name: ali | Phone: 60 18-322 9978 | Budget: 80k | Status: contacted
Name: Aron Teh | Phone: 60 12-210 3060 | Budget: 30k | Scope: kitchen only | Status: contacted
Name: amir | Phone: 60 17-664 6496 | Budget: 13k | Scope: kitchen + 2 rooms | Status: contacted
Name: mr suhaili | Phone: 60 19-454 8441 | Scope: kitchen only | Status: contacted
Name: Aneesha | Phone: 60 17-681 1306 | Assigned: melvin | Status: quoted
Name: Nasuha | Phone: 60 17-609 5941 | Assigned: melvin | Scope: dry kitchen only | Status: following_up
Name: nazrul azhar | Phone: 60 12-245 1239 | Scope: plywood kitchen + island | Status: quoted
```

---

## Dependencies (Builder needs before starting)

- [ ] Python 3.11+ installed on local machine
- [ ] `.env` file with:
  ```
  DASHBOARD_USER=admin
  DASHBOARD_PASS=hoga2024
  FB_VERIFY_TOKEN=melvin_webhook_secret
  FB_PAGE_ACCESS_TOKEN=  # leave blank for Phase 1, fill in Phase 2
  ```

---

## After Building

Builder produces `build-report.md` with:
- Screenshot or curl output proving each endpoint works
- Instructions to run: `uvicorn main:app --reload`

Send to Reviewer: **YES** — send `build-report.md` + `main.py` + `routes/` to GPT-4o for security + logic review before Phase 2.
