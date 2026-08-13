"""One-time seed of historical quotation QT2026-1838 (client Vijay), migrated from
the previous system.

Once-only AND idempotent: a `seed_qt1838` counter marker guarantees the quote is
inserted exactly once. If the quote already exists (or the marker is set) this is a
no-op, so redeploys never duplicate it — and if the quote is later edited or deleted
on purpose, it will NOT come back.
"""
import json
import os
from datetime import datetime

from models import Quote, QuoteItem, Counter

QUOTE_NUMBER = "QT2026-1838"
MARKER = "seed_qt1838"
_DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_quotes.json")


def _mark_done(db, marker):
    if marker:
        marker.value = 1
    else:
        db.add(Counter(name=MARKER, value=1))
    db.commit()


def seed_once(db) -> int:
    """Insert the Vijay quote if it has never been seeded. Returns items inserted (0 if skipped)."""
    marker = db.query(Counter).filter(Counter.name == MARKER).first()
    if marker and marker.value >= 1:
        return 0  # already seeded once — do not resurrect

    # If a quote with this number already exists (seeded another way), just record the marker.
    if db.query(Quote).filter(Quote.quote_number == QUOTE_NUMBER).first():
        _mark_done(db, marker)
        return 0

    with open(_DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    q = dict(data["quote"])
    created = q.pop("created_at", None)
    quote = Quote(**q)
    if created:
        try:
            quote.created_at = datetime.fromisoformat(created)
        except (ValueError, TypeError):
            pass
    db.add(quote)
    db.flush()  # assign quote.id

    for it in data["items"]:
        db.add(QuoteItem(quote_id=quote.id, **it))

    # Advance the quote counter so the next new quote number can't collide with 1838.
    n = 0
    try:
        n = int(QUOTE_NUMBER.split("-")[-1])
    except ValueError:
        pass
    ctr = db.query(Counter).filter(Counter.name == "quote").first()
    if not ctr:
        db.add(Counter(name="quote", value=n))
    else:
        ctr.value = max(ctr.value, n)

    _mark_done(db, marker)
    return len(data["items"])
