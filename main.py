import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db
from auth import get_current_user
from routes import leads, webhook, dashboard
from routes.auth_routes import router as auth_router
from routes import quotes, products, presets, packages, checklists


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-init migrations: these add columns the ORM models already declare, so they
    # MUST run before init_db()/import_data() query those tables via the ORM.
    # (ALTERs are skipped on a brand-new DB — the table won't exist yet and is created
    # with the columns by create_all; PRAGMA returns empty, so the guards no-op.)
    try:
        import sqlite3 as _sqlite0
        _c0 = _sqlite0.connect("data/melvin.db")
        _p0 = {row[1] for row in _c0.execute("PRAGMA table_info(products)")}
        if _p0 and "details" not in _p0:
            _c0.execute("ALTER TABLE products ADD COLUMN details TEXT")
            _c0.commit()
            print("Migration: added products.details column")
        _qi0 = {row[1] for row in _c0.execute("PRAGMA table_info(quote_items)")}
        if _qi0 and "details" not in _qi0:
            _c0.execute("ALTER TABLE quote_items ADD COLUMN details TEXT")
            _c0.commit()
            print("Migration: added quote_items.details column")
        _c0.close()
    except Exception as e:
        print(f"Pre-init details migration skipped: {e}")
    init_db()
    # Auto-import seed data if database is empty
    try:
        from services.import_data import run as import_data
        import_data()
    except Exception as e:
        print(f"Data import skipped: {e}")
    # Migrate: add area and sort_order columns to leads if missing
    try:
        import sqlite3 as _sqlite3
        _conn = _sqlite3.connect("data/melvin.db")
        _existing = {row[1] for row in _conn.execute("PRAGMA table_info(leads)")}
        if "area" not in _existing:
            _conn.execute("ALTER TABLE leads ADD COLUMN area VARCHAR(50)")
            _conn.commit()
            print("Migration: added leads.area column")
        if "sort_order" not in _existing:
            _conn.execute("ALTER TABLE leads ADD COLUMN sort_order INTEGER")
            _conn.commit()
            print("Migration: added leads.sort_order column")
        if "follow_up_note" not in _existing:
            _conn.execute("ALTER TABLE leads ADD COLUMN follow_up_note TEXT")
            _conn.commit()
            print("Migration: added leads.follow_up_note column")
        _qi_cols = {row[1] for row in _conn.execute("PRAGMA table_info(quote_items)")}
        if _qi_cols and "group_name" not in _qi_cols:
            _conn.execute("ALTER TABLE quote_items ADD COLUMN group_name VARCHAR(120)")
            _conn.commit()
            print("Migration: added quote_items.group_name column")
        # (products.details and quote_items.details are added in the pre-init block above)
        _q_cols = {row[1] for row in _conn.execute("PRAGMA table_info(quotes)")}
        for _c, _sql in (("size_range", "VARCHAR(50)"), ("design_theme", "VARCHAR(120)"), ("condo_name", "VARCHAR(150)")):
            if _q_cols and _c not in _q_cols:
                _conn.execute(f"ALTER TABLE quotes ADD COLUMN {_c} {_sql}")
                _conn.commit()
                print(f"Migration: added quotes.{_c} column")
        if _q_cols and "ic_number" not in _q_cols:
            _conn.execute("ALTER TABLE quotes ADD COLUMN ic_number VARCHAR(50)")
            _conn.commit()
            print("Migration: added quotes.ic_number column")
        if _q_cols and "customer_address" not in _q_cols:
            _conn.execute("ALTER TABLE quotes ADD COLUMN customer_address VARCHAR(300)")
            _conn.commit()
            print("Migration: added quotes.customer_address column")
        # One-time: attribute all existing quotes to Melvin. Idempotent — once every
        # row is 'Melvin' this UPDATE matches nothing, so redeploys are a no-op.
        if _q_cols:
            _cb = _conn.execute(
                "UPDATE quotes SET created_by='Melvin' WHERE created_by IS NULL OR created_by != 'Melvin'").rowcount
            if _cb:
                _conn.commit()
                print(f"Migration: set created_by='Melvin' on {_cb} existing quote(s)")
        _pkg_cols = {row[1] for row in _conn.execute("PRAGMA table_info(quote_packages)")}
        if _pkg_cols and "category" not in _pkg_cols:
            _conn.execute("ALTER TABLE quote_packages ADD COLUMN category VARCHAR(60)")
            _conn.commit()
            print("Migration: added quote_packages.category column")
        if _pkg_cols and "subtitle" not in _pkg_cols:
            _conn.execute("ALTER TABLE quote_packages ADD COLUMN subtitle VARCHAR(200)")
            _conn.commit()
            print("Migration: added quote_packages.subtitle column")
        if _pkg_cols and "sort_order" not in _pkg_cols:
            _conn.execute("ALTER TABLE quote_packages ADD COLUMN sort_order INTEGER DEFAULT 0")
            _conn.commit()
            print("Migration: added quote_packages.sort_order column")
        # Relabel legacy area values (pj/kl/border) as 'office'
        _n = _conn.execute(
            "UPDATE leads SET area='office' WHERE area IN ('pj','kl','border')").rowcount
        if _n:
            _conn.commit()
            print(f"Migration: relabeled {_n} legacy-area leads as office")
        # Retire the 'contacted' and 'quoted' pipeline stages: those board columns
        # were removed, so any lead still sitting in them is moved to 'new' to stay
        # visible on the board. Idempotent — once moved, no rows match on redeploy.
        _ncq = _conn.execute(
            "UPDATE leads SET status='new' WHERE status IN ('contacted','quoted')").rowcount
        if _ncq:
            _conn.commit()
            print(f"Migration: moved {_ncq} contacted/quoted leads to new")
        # --- Numbering: 2026-18xx block, self-healing and collision-proof. ---
        # These two steps are INDEPENDENT (separate try/commit) on purpose: a blind
        # REPLACE(00xx->18xx) can hit an already-existing new-quote number and raise
        # UNIQUE, which used to abort the whole migration and leave the counter stuck,
        # so every "save quotation" 500'd. Step (b) must run regardless of step (a).
        _conn.execute("INSERT OR IGNORE INTO counters(name, value) VALUES ('quote', 0), ('invoice', 0)")
        _conn.commit()
        # (a) Relabel leftover 00xx quotes to 18xx — but ONLY where the 18xx target is
        #     free, so we never collide with a number a new quote already took. Keeps
        #     leads.quote_id in sync. Idempotent: once renamed, no 00xx rows remain.
        try:
            _existing = {r[0] for r in _conn.execute("SELECT quote_number FROM quotes")}
            _renamed = 0
            for (_old,) in _conn.execute(
                    "SELECT quote_number FROM quotes WHERE quote_number LIKE 'QT2026-00%'").fetchall():
                _new = _old.replace("2026-00", "2026-18")
                if _new in _existing:
                    continue  # target taken — leave as-is rather than break the migration
                _conn.execute("UPDATE quotes SET quote_number=? WHERE quote_number=?", (_new, _old))
                _conn.execute("UPDATE leads SET quote_id=? WHERE quote_id=?", (_new, _old))
                _existing.discard(_old); _existing.add(_new); _renamed += 1
            if _renamed:
                _conn.commit()
                print(f"Migration: relabeled {_renamed} quote number(s) 00xx -> 18xx")
        except Exception as _e:
            print(f"Quote relabel skipped: {_e}")
        # (b) Advance each counter PAST the highest existing document number (floor 1811,
        #     so new numbers stay in the 18xx block). This is the fix for the save-quote
        #     500: the next generated number can never equal an existing one. Monotonic
        #     (never lowers a counter) => safe and idempotent across redeploys.
        try:
            def _bump(counter_name, table, col):
                hi = _conn.execute(
                    f"SELECT MAX(CAST(substr({col}, instr({col}, '-') + 1) AS INTEGER)) "
                    f"FROM {table} WHERE {col} LIKE '%2026-%'").fetchone()[0] or 0
                row = _conn.execute("SELECT value FROM counters WHERE name=?", (counter_name,)).fetchone()
                cur = row[0] if row else 0
                target = max(hi, cur, 1811)
                if target != cur:
                    _conn.execute("UPDATE counters SET value=? WHERE name=?", (target, counter_name))
                    print(f"Migration: set {counter_name} counter to {target} (next number {target + 1})")
            _bump("quote", "quotes", "quote_number")
            _bump("invoice", "invoices", "invoice_number")
            _conn.commit()
        except Exception as _e:
            print(f"Counter bump skipped: {_e}")
        _conn.close()
    except Exception as e:
        print(f"Column migration skipped: {e}")
    # Single-user setup: the sole admin account (Melvin) is created/maintained by
    # database.init_db() from ADMIN_USER / ADMIN_PASS. No other accounts are seeded.
    # Seed default preset library if empty
    try:
        from database import SessionLocal
        from services.seed_presets import seed_if_empty
        _db = SessionLocal()
        try:
            seed_if_empty(_db)
        finally:
            _db.close()
    except Exception as e:
        print(f"Preset seed skipped: {e}")
    # Seed the standard package tiers (Condominium / Landed) if missing
    try:
        from database import SessionLocal
        from services.seed_packages import seed_if_missing
        _db = SessionLocal()
        try:
            n = seed_if_missing(_db)
            if n:
                print(f"Seeded {n} package tiers")
        finally:
            _db.close()
    except Exception as e:
        print(f"Package seed skipped: {e}")
    yield


app = FastAPI(title="Melvin Gan Carpentry", lifespan=lifespan)

# Auth routes (no protection)
app.include_router(auth_router)

# Protected routes
app.include_router(leads.router,     dependencies=[Depends(get_current_user)])
app.include_router(webhook.router)   # FB calls this directly, no session
app.include_router(dashboard.router, dependencies=[Depends(get_current_user)])
app.include_router(quotes.router,    dependencies=[Depends(get_current_user)])
app.include_router(products.router,  dependencies=[Depends(get_current_user)])
app.include_router(presets.router,   dependencies=[Depends(get_current_user)])
app.include_router(packages.router,  dependencies=[Depends(get_current_user)])
app.include_router(checklists.router, dependencies=[Depends(get_current_user)])

app.mount("/static", StaticFiles(directory="frontend"), name="static")


_NO_CACHE = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}

def _html(path: str, user=None):
    return FileResponse(f"frontend/{path}", headers=_NO_CACHE)


@app.get("/")
def serve_dashboard(request: Request, user: dict = Depends(get_current_user)):
    return _html("index.html")


@app.get("/leads-page")
def serve_leads(user: dict = Depends(get_current_user)):
    return _html("leads.html")


@app.get("/lead/{lead_id}")
def serve_lead_detail(lead_id: int, user: dict = Depends(get_current_user)):
    return _html("lead_detail.html")


@app.get("/new-quote")
def serve_new_quote(user: dict = Depends(get_current_user)):
    return _html("quote_form.html")


@app.get("/quote/{quote_id}")
def serve_quote_detail(quote_id: int, user: dict = Depends(get_current_user)):
    return _html("quote_detail.html")


@app.get("/quote-edit/{quote_id}")
def serve_quote_edit(quote_id: int, user: dict = Depends(get_current_user)):
    return _html("quote_form.html")


@app.get("/admin/presets")
def serve_presets_admin(user: dict = Depends(get_current_user)):
    return _html("presets_admin.html")


@app.get("/quotes-page")
def serve_quotes_list(user: dict = Depends(get_current_user)):
    return _html("quotes_list.html")


@app.get("/quick-add")
def serve_quick_add(user: dict = Depends(get_current_user)):
    return _html("quick_add.html")


@app.get("/checklists-page")
def serve_checklists(user: dict = Depends(get_current_user)):
    return _html("checklists.html")


@app.get("/products-page")
def serve_products(user: dict = Depends(get_current_user)):
    # Products now live under the Library page's Products tab — keep old links working
    return RedirectResponse(url="/admin/presets#products", status_code=307)


@app.get("/admin/fix-counters")
def fix_counters(user: dict = Depends(get_current_user), db=Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    from models import Quote, Counter
    from sqlalchemy import func
    max_q = db.query(func.max(Quote.quote_number)).scalar() or "QT2026-0000"
    try:
        max_num = int(max_q.split("-")[-1])
    except ValueError:
        max_num = 0
    counter = db.query(Counter).filter(Counter.name == "quote").first()
    if not counter:
        counter = Counter(name="quote", value=max_num)
        db.add(counter)
    else:
        counter.value = max_num
    db.commit()
    return {"status": "ok", "quote_counter_set_to": max_num}


@app.get("/admin/reload-products")
def reload_products(user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Wipe the products table and reseed it from frontend/materials.json."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    import json, pathlib
    from models import Product
    mf = pathlib.Path(__file__).parent / "frontend" / "materials.json"
    if not mf.exists():
        raise HTTPException(status_code=500, detail="materials.json not found")
    items = json.loads(mf.read_text(encoding="utf-8"))
    db.query(Product).delete()
    for item in items:
        db.add(Product(
            type=item.get("type", ""),
            room=item.get("room", ""),
            description=item.get("desc", ""),
            uom=item.get("uom"),
            price=float(item.get("price", 0)),
        ))
    db.commit()
    return {"status": "ok", "products": len(items)}


@app.get("/admin/reload-presets")
def reload_presets(user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Wipe the preset library and reseed it from services/seed_presets.py."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    from models import PresetArea, PresetSubArea, PresetSet, PresetItem
    from services.seed_presets import seed_if_empty
    db.query(PresetItem).delete()
    db.query(PresetSet).delete()
    db.query(PresetSubArea).delete()
    db.query(PresetArea).delete()
    db.commit()
    seed_if_empty(db)
    return {
        "status": "ok",
        "areas": db.query(PresetArea).count(),
        "sets": db.query(PresetSet).count(),
        "items": db.query(PresetItem).count(),
    }


@app.get("/admin/import-data")
def trigger_import(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    try:
        from services.import_data import run as import_data
        import_data()
        return {"status": "ok", "message": "Import completed"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/admin/export-data")
def export_data(user: dict = Depends(get_current_user), db=Depends(get_db)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    import json
    from fastapi.responses import Response
    from models import Lead, Quote, QuoteItem, Invoice, StatusLog, User as UserModel

    def row(obj):
        result = {}
        for col in obj.__table__.columns:
            val = getattr(obj, col.name)
            result[col.name] = val.isoformat() if hasattr(val, "isoformat") else val
        return result

    data = {
        "exported_at": __import__("datetime").datetime.utcnow().isoformat(),
        "leads":       [row(r) for r in db.query(Lead).order_by(Lead.id).all()],
        "quotes":      [row(r) for r in db.query(Quote).order_by(Quote.id).all()],
        "quote_items": [row(r) for r in db.query(QuoteItem).order_by(QuoteItem.id).all()],
        "invoices":    [row(r) for r in db.query(Invoice).order_by(Invoice.id).all()],
        "status_logs": [row(r) for r in db.query(StatusLog).order_by(StatusLog.id).all()],
        "users":       [{k: v for k, v in row(r).items() if k != "password_hash"}
                        for r in db.query(UserModel).order_by(UserModel.id).all()],
    }
    return Response(
        content=json.dumps(data, indent=2, default=str).encode(),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=melvin-gan-carpentry-export.json"},
    )


@app.exception_handler(HTTPException)
async def authn_handler(request: Request, exc: HTTPException):
    if exc.status_code == 401:
        return RedirectResponse("/login", status_code=302)
    raise exc
