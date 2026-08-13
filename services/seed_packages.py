"""Seed the three standard package tiers under each property category.

First-run only: seeds ONLY when the database has no quote packages at all.
Once any package exists, this never runs again — so tiers the user deletes
(e.g. Big Lux) stay deleted across restarts and deploys.
Each seeded package is a starter shell — Kitchen, Living Room and N bedroom
sections with empty item tables, ready to be filled in the quote editor.
"""
import json
from models import QuotePackage

CATEGORIES = ["Condominium", "Landed"]

# (name, subtitle, number of bedrooms)
TIERS = [
    ("Essential", "1,000–1,200 sqft · 2 rooms", 2),
    ("Lifestyle", "1,200–1,500 sqft · 3 rooms", 3),
    ("Big Lux",   "1,500–2,000 sqft · 4 rooms", 4),
]


def _sections(rooms: int) -> list[dict]:
    secs = [
        {"key": None, "name": "Kitchen", "open": True, "groups": []},
        {"key": None, "name": "Living Room", "open": True, "groups": []},
    ]
    for i in range(1, rooms + 1):
        secs.append({"key": None, "name": f"Bedroom {i}", "open": True, "groups": []})
    return secs


def seed_if_missing(db):
    # First run only: if ANY quote package exists (even a user-renamed or
    # partially deleted set), do nothing — re-adding "missing" tiers here is
    # what resurrected deleted packages on every deploy.
    if db.query(QuotePackage).filter(QuotePackage.kind == "quote").count() > 0:
        return 0
    created = 0
    for category in CATEGORIES:
        for name, subtitle, rooms in TIERS:
            data = {
                "sst_rate": 0,
                "terms_notes": "",
                "discount": {"raw": "", "waive": False},
                "sections": _sections(rooms),
            }
            db.add(QuotePackage(
                name=name, kind="quote", category=category, subtitle=subtitle,
                data=json.dumps(data), created_by="system",
            ))
            created += 1
    if created:
        db.commit()
    return created
