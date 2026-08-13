"""
One-time seed script: migrates historical leads from Excel prospect sheet.
Run with: python -m services.seed
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, init_db
from models import Lead, StatusLog

LEADS = [
    {"full_name": "Erine", "phone": "60162096866", "budget": "35k", "request_notes": "Full house makeover", "location": "Myara Ara Damansara", "status": "following_up"},
    {"full_name": "Si Woei", "phone": "60102190219", "budget": "30k", "request_notes": "Full house makeover", "location": "Gem Residences", "status": "following_up"},
    {"full_name": "Misha", "phone": "60126865120", "budget": "nil", "request_notes": "Full house makeover", "status": "contacted"},
    {"full_name": "Aishwarya", "phone": "60183955386", "budget": "20k", "request_notes": "Kitchen + wardrobe", "status": "contacted"},
    {"full_name": "Ivan Teoh", "phone": "60126804948", "budget": "27k", "request_notes": "Customise package — checking if living room parts can be moved to other areas", "status": "following_up"},
    {"full_name": "Nazrul NZ", "phone": "60102315512", "budget": "30k", "request_notes": "Full renovation: iron grille, shoe cabinet, ceiling/wall skim coat, flooring, kitchen (oven/hob/hood/dishwasher), aluminium sliding door, wardrobes BR2/BR3, study cabinet, 2 toilets retile", "status": "quoted"},
    {"full_name": "Tony", "phone": "60163110022", "request_notes": "Studio, Astrum Ampang", "assigned_to": "Mr Kiew", "status": "quoted"},
    {"full_name": "Lez", "phone": "60143247649", "assigned_to": "Mr Kiew", "status": "quoted"},
    {"full_name": "Fatboy", "phone": "60123960518", "request_notes": "Exceeded budget", "assigned_to": "Mr Kiew", "status": "lost"},
    {"full_name": "Stephanie", "phone": "60149149342", "budget": "20k", "request_notes": "Dry + wet kitchen: 6.2ft base+wall, 6.2ft base only, 2.5ft tall cabinet, yard 3ft+3ft base", "location": "Damansara Perdana, D'Terra Residences", "status": "quoted"},
    {"full_name": "Mr Rao", "phone": "60123053592", "status": "contacted"},
    {"full_name": "Siti Asmah", "phone": "60122961164", "budget": "15k", "request_notes": "Kitchen only — aluminium base, MFC wall 7x6ft", "status": "quoted"},
    {"full_name": "Muzz", "phone": "60102626861", "budget": "60k", "request_notes": "Full unit, June key collection", "status": "following_up"},
    {"full_name": "Erna", "phone": "60194299199", "request_notes": "Full unit — installment plan", "status": "following_up"},
    {"full_name": "Nurin", "budget": "40k", "request_notes": "Full unit, comparing quotes", "status": "following_up"},
    {"full_name": "Ali", "phone": "60183229978", "budget": "80k", "status": "contacted"},
    {"full_name": "Aron Teh", "phone": "60122103060", "budget": "30k", "request_notes": "Kitchen only", "status": "contacted"},
    {"full_name": "Amir", "phone": "60176646496", "budget": "13k", "request_notes": "Kitchen + 2 rooms", "status": "contacted"},
    {"full_name": "Mr Suhaili", "phone": "60194548441", "request_notes": "Kitchen only", "status": "contacted"},
    {"full_name": "Aneesha", "phone": "60176811306", "assigned_to": "Melvin", "status": "quoted"},
    {"full_name": "Nasuha", "phone": "60176095941", "request_notes": "Dry kitchen only", "assigned_to": "Melvin", "status": "following_up"},
    {"full_name": "Nazrul Azhar", "phone": "60122451239", "request_notes": "Plywood kitchen + island (21sqft 7x3ft) quartz countertop. Quoted RM25,925 plywood / RM6,790 island add-on", "status": "quoted"},
]


def run():
    init_db()
    db = SessionLocal()
    try:
        existing = db.query(Lead).count()
        if existing > 0:
            print(f"Database already has {existing} leads. Skipping seed to avoid duplicates.")
            return

        for data in LEADS:
            lead = Lead(**data)
            db.add(lead)
            db.flush()
            db.add(StatusLog(lead_id=lead.id, from_status=None, to_status=lead.status, note="Migrated from Excel"))

        db.commit()
        print(f"Seeded {len(LEADS)} leads successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
