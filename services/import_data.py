"""
One-time data import script. Run via Railway Console:
  python -m services.import_data
"""
import sys, os, json
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, init_db
from models import Lead, Quote, QuoteItem, User, Counter

DATETIME_FIELDS = {"created_at", "updated_at", "last_follow_up", "status_changed_at", "appointment_at"}

def parse_row(row: dict, skip: set) -> dict:
    result = {}
    for k, v in row.items():
        if k in skip:
            continue
        if k in DATETIME_FIELDS and isinstance(v, str):
            try:
                v = datetime.fromisoformat(v.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                v = None
        result[k] = v
    return result

def run():
    init_db()
    db = SessionLocal()

    # One-time seed ONLY: never re-import into a database that already has data.
    # This runs on every startup (main.py lifespan); without this guard it would
    # duplicate all leads/quotes on each deploy once quote numbers stop colliding.
    if db.query(Lead).first() or db.query(Quote).first():
        db.close()
        return

    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "export_data.json")) as f:
        data = json.load(f)

    SKIP_LEAD = {"id", "status_logs"}
    SKIP_QUOTE = {"id", "items"}
    SKIP_ITEM = {"id"}
    SKIP_USER = {"id"}

    # Users
    existing_users = {u.username for u in db.query(User).all()}
    imported_users = 0
    for u in data["users"]:
        if u["username"] not in existing_users:
            db.add(User(**parse_row(u, SKIP_USER)))
            imported_users += 1
    db.flush()

    # Leads — map old id → new id
    lead_id_map = {}
    for l in data["leads"]:
        old_id = l["id"]
        obj = Lead(**parse_row(l, SKIP_LEAD))
        db.add(obj)
        db.flush()
        lead_id_map[old_id] = obj.id

    # Quotes — map old id → new id
    quote_id_map = {}
    for q in data["quotes"]:
        old_id = q["id"]
        row = parse_row(q, SKIP_QUOTE)
        if row.get("lead_id") and row["lead_id"] in lead_id_map:
            row["lead_id"] = lead_id_map[row["lead_id"]]
        obj = Quote(**row)
        db.add(obj)
        db.flush()
        quote_id_map[old_id] = obj.id

    # Quote items
    for item in data["items"]:
        row = parse_row(item, SKIP_ITEM)
        if row.get("quote_id") and row["quote_id"] in quote_id_map:
            row["quote_id"] = quote_id_map[row["quote_id"]]
        db.add(QuoteItem(**row))

    # Set quote counter to max imported quote number so new quotes don't collide
    if data["quotes"]:
        max_num = 0
        for q in data["quotes"]:
            try:
                num = int(q.get("quote_number", "").split("-")[-1])
                if num > max_num:
                    max_num = num
            except (ValueError, AttributeError):
                pass
        if max_num > 0:
            counter = db.query(Counter).filter(Counter.name == "quote").first()
            if not counter:
                counter = Counter(name="quote", value=max_num)
                db.add(counter)
            else:
                counter.value = max(counter.value, max_num)

    db.commit()
    print(f"Imported: {imported_users} users, {len(lead_id_map)} leads, {len(quote_id_map)} quotes, {len(data['items'])} items")
    db.close()

if __name__ == "__main__":
    run()
