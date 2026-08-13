"""Seed the preset library from the hoga Calculator (15 July) consolidate sheet.

Runs once at startup — no-op if any presets already exist.
Re-apply on a live DB via GET /admin/reload-presets (admin only).

Prices marked (kept) are carried over from the previous library because the
15 July calculator lists no price for them (Painting rows are '?', Flooring
row is a placeholder).
"""
from sqlalchemy.orm import Session
from models import PresetArea, PresetSubArea, PresetSet, PresetItem


SEED = [
    {"area": "Kitchen", "target_room": "Kitchen", "subs": [
        {"name": "Wet Area", "sets": [
            {"name": "Default Set (MFC)", "run_ft": 10, "category": "construction", "items": [
                {"description": "MFC Wall Cabinet (300mm D x 700mm H)",            "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 330},
                {"description": "MFC Base Cabinet (600mm D x 850mm H)",            "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 320},
                {"description": "Quartz Stone Countertop (600mm D)",               "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 185},
                {"description": "MFC Tall / Full Height Cabinet (up to 2700mm H)", "uom": "ft",  "is_per_ft": False, "qty": 4, "unit_price": 640},
                {"description": "PVC Sink Carcass",                                "uom": "pc",  "is_per_ft": False, "qty": 1, "unit_price": 250},
                {"description": "Sink + Pull Out Tap (NTVT-6046B-SV + 8311-ST)",   "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 450},
                {"description": "Dish Rack (W9600) Ecoware",                       "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 80},
                {"description": "MFC Drawer Set",                                  "uom": "set", "is_per_ft": False, "qty": 2, "unit_price": 300},
                {"description": "Running LED Lights",                              "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 35},
            ]},
            {"name": "Plywood Set", "run_ft": 10, "category": "construction", "items": [
                {"description": "Plywood Wall Cabinet (300mm D x 700mm H)",              "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 480},
                {"description": "Plywood Base Cabinet (600mm D x 850mm H)",              "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 470},
                {"description": "Quartz Stone Countertop (600mm D)",                     "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 185},
                {"description": "Plywood Tall / Full Height Cabinet (up to 2700mm H)",   "uom": "ft",  "is_per_ft": False, "qty": 4, "unit_price": 910},
                {"description": "PVC Sink Carcass",                                      "uom": "pc",  "is_per_ft": False, "qty": 1, "unit_price": 250},
                {"description": "Sink + Pull Out Tap (NTVT-6046B-SV + 8311-ST)",         "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 450},
                {"description": "Dish Rack (W9600) Ecoware",                             "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 80},
                {"description": "Running LED Lights",                                    "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 35},
            ]},
            {"name": "Aluminium Set", "run_ft": 10, "category": "construction", "items": [
                {"description": "Aluminium Wall Cabinet (300mm D x up to 700mm H)",      "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 510},
                {"description": "Aluminium Base Cabinet (540mm D x 725mm H)",            "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 550},
                {"description": "Sintered Stone Countertop (600mm D)",                   "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 250},
                {"description": "Aluminium Tall Cabinet ATC-1 (520mm D x 3000mm H)",     "uom": "ft",  "is_per_ft": False, "qty": 4, "unit_price": 1605},
                {"description": "PVC Sink Carcass",                                      "uom": "pc",  "is_per_ft": False, "qty": 1, "unit_price": 250},
                {"description": "Sink + Pull Out Tap (NTVT-6046B-SV + 8311-ST)",         "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 450},
                {"description": "Dish Rack (W9600) Ecoware",                             "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 80},
                {"description": "Running LED Lights",                                    "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 35},
            ]},
        ]},
        {"name": "Dry Area", "sets": [
            {"name": "Default Set (MFC)", "run_ft": 4, "category": "construction", "items": [
                {"description": "MFC Wall Cabinet (300mm D x 700mm H)",          "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 330},
                {"description": "MFC Base Cabinet (600mm D x 850mm H)",          "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 320},
                {"description": "Quartz Stone Countertop (600mm D)",             "uom": "ft",  "is_per_ft": True,  "qty": 1, "unit_price": 185},
                {"description": "PVC Sink Carcass",                              "uom": "pc",  "is_per_ft": False, "qty": 1, "unit_price": 250},
                {"description": "Sink + Pull Out Tap (NTVT-6046B-SV + 8311-ST)", "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 450},
                {"description": "Dish Rack (W9600) Ecoware",                     "uom": "set", "is_per_ft": False, "qty": 1, "unit_price": 80},
            ]},
        ]},
    ]},
    {"area": "Foyer", "target_room": "Foyer", "subs": [
        {"name": "Entrance", "sets": [
            {"name": "Shoe Cabinet Set (MFC)", "run_ft": 4, "category": "construction", "items": [
                {"description": "MFC Shoe Cabinet (350mm H)",     "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 540},
                {"description": "MFC Console Cabinet (350mm H)",  "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 350},
            ]},
            {"name": "Shoe Cabinet Set (Plywood)", "run_ft": 4, "category": "construction", "items": [
                {"description": "Plywood Shoe Cabinet (350mm H)",    "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 620},
                {"description": "Plywood Console Cabinet (350mm H)", "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 400},
            ]},
            {"name": "Shoe Cabinet (Aluminium)", "run_ft": 4, "category": "construction", "items": [
                {"description": "Aluminium Shoe Cabinet (380mm D x 1800mm H)", "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 780},
            ]},
        ]},
    ]},
    {"area": "Living Room", "target_room": "Living Room", "subs": [
        {"name": "Living Area", "sets": [
            {"name": "TV Cabinet + Wall Panels (MFC)", "run_ft": None, "category": "construction", "items": [
                {"description": "MFC Wall Paneling (5ft x 6ft)",                "uom": "sqft", "is_per_ft": False, "qty": 30, "unit_price": 45},
                {"description": "MFC TV Console Cabinet (up to 350mm H)",       "uom": "ft",   "is_per_ft": False, "qty": 5,  "unit_price": 350},
            ]},
            {"name": "TV Cabinet + Wall Panels (Plywood)", "run_ft": None, "category": "construction", "items": [
                {"description": "Plywood Wall Paneling (5ft x 6ft)",            "uom": "sqft", "is_per_ft": False, "qty": 30, "unit_price": 65},
                {"description": "Plywood TV Console Cabinet (up to 350mm H)",   "uom": "ft",   "is_per_ft": False, "qty": 5,  "unit_price": 400},
            ]},
            {"name": "TV Console (Aluminium)", "run_ft": None, "category": "construction", "items": [
                {"description": "Aluminium TV Console (450mm D x 450mm H)",     "uom": "ft",   "is_per_ft": False, "qty": 5,  "unit_price": 530},
            ]},
            {"name": "Ceiling + Downlights", "run_ft": None, "category": "construction", "items": [
                {"description": "Plaster Ceiling L-box for LED strip / T5 concealed lighting", "uom": "ft",   "is_per_ft": False, "qty": 20, "unit_price": 30},
                {"description": "Downlight / Eyeball & Installation",                          "uom": "unit", "is_per_ft": False, "qty": 30, "unit_price": 60},
            ]},
            {"name": "Dining", "run_ft": None, "category": "construction", "items": [
                {"description": "MFC Sideboard Base Cabinet (600mm D x 850mm H)", "uom": "ft", "is_per_ft": False, "qty": 6, "unit_price": 320},
                {"description": "Quartz Stone Countertop (600mm D)",              "uom": "ft", "is_per_ft": False, "qty": 6, "unit_price": 185},
            ]},
        ]},
    ]},
    {"area": "Bed Room", "target_room": "Bed Room", "subs": [
        {"name": "Bedroom", "sets": [
            {"name": "Swing Wardrobe (MFC)", "run_ft": 6, "category": "construction", "items": [
                {"description": "MFC Swing Wardrobe (600mm D x 2700mm H)", "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 650},
            ]},
            {"name": "Sliding Wardrobe (MFC)", "run_ft": 8, "category": "construction", "items": [
                {"description": "MFC Sliding Wardrobe (H: 2400, Carcass H: 2100)", "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 980},
            ]},
            {"name": "Swing Wardrobe (Plywood)", "run_ft": 6, "category": "construction", "items": [
                {"description": "Plywood Swing Wardrobe (600mm D x 2700mm H)", "uom": "ft", "is_per_ft": True, "qty": 1, "unit_price": 940},
            ]},
            {"name": "Bed Head + Dressing Table (MFC)", "run_ft": None, "category": "construction", "items": [
                {"description": "MFC Bed Head 5ft Height (1500mm H)",       "uom": "ft", "is_per_ft": False, "qty": 5, "unit_price": 220},
                {"description": "MFC Dressing Table (600mm D x 300mm H)",   "uom": "ft", "is_per_ft": False, "qty": 4, "unit_price": 350},
            ]},
        ]},
    ]},
    {"area": "Structural", "target_room": "Structural", "subs": [
        {"name": "Whole House", "sets": [
            {"name": "Flooring", "run_ft": None, "category": "construction", "items": [
                # (kept) — no flooring price in the 15 July calculator
                {"description": "Vinyl / Laminate Flooring (supply & install)", "uom": "sqft", "is_per_ft": False, "qty": 400, "unit_price": 12},
            ]},
            {"name": "Ceiling (Gypsum + Wiring)", "run_ft": None, "category": "construction", "items": [
                {"description": "Flat Gypsum Board Ceiling w/ Plastering",            "uom": "sqft", "is_per_ft": False, "qty": 300, "unit_price": 5.2},
                {"description": "Hacking and Relocation Wirings (Rooms)",             "uom": "set",  "is_per_ft": False, "qty": 1,   "unit_price": 500},
                {"description": "Lighting/Fan Point w/ SSO (2.5mm SIRIM, concealed)", "uom": "set",  "is_per_ft": False, "qty": 10,  "unit_price": 110},
                {"description": "13A Power Point w/ SSO (2.5mm SIRIM, concealed)",    "uom": "set",  "is_per_ft": False, "qty": 10,  "unit_price": 150},
                {"description": "Downlight / Eyeball & Installation",                 "uom": "unit", "is_per_ft": False, "qty": 20,  "unit_price": 60},
            ]},
            {"name": "Painting", "run_ft": None, "category": "construction", "items": [
                # (kept) — Painting price is '?' in the 15 July calculator
                {"description": "Whole-house Painting (interior, 2 coats)", "uom": "sqft", "is_per_ft": False, "qty": 1200, "unit_price": 3.5},
            ]},
        ]},
    ]},
]


def seed_if_empty(db: Session) -> None:
    if db.query(PresetArea).count() > 0:
        return
    for ai, a in enumerate(SEED):
        area = PresetArea(name=a["area"], target_room=a["target_room"], sort_order=ai)
        db.add(area); db.flush()
        for si, sub in enumerate(a["subs"]):
            sub_obj = PresetSubArea(area_id=area.id, name=sub["name"], sort_order=si)
            db.add(sub_obj); db.flush()
            for seti, s in enumerate(sub["sets"]):
                set_obj = PresetSet(
                    sub_area_id=sub_obj.id, name=s["name"], run_ft=s["run_ft"],
                    category=s["category"], sort_order=seti,
                )
                db.add(set_obj); db.flush()
                for ii, it in enumerate(s["items"]):
                    db.add(PresetItem(
                        set_id=set_obj.id,
                        description=it["description"], uom=it["uom"],
                        is_per_ft=it["is_per_ft"], qty=it["qty"],
                        unit_price=it["unit_price"], sort_order=ii,
                    ))
    db.commit()
    print(f"Seeded {sum(len(sub['sets']) for a in SEED for sub in a['subs'])} preset sets")
