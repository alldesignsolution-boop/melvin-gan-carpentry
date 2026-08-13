import os
import httpx
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Lead, StatusLog

router = APIRouter(prefix="/webhook", tags=["webhook"])

FB_GRAPH = "https://graph.facebook.com/v19.0"


def _fields_to_dict(field_data: list) -> dict:
    return {item["name"]: item["values"][0] for item in field_data if item.get("values")}


async def _fetch_lead(leadgen_id: str, token: str) -> dict:
    """Call Graph API to retrieve actual lead field values."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{FB_GRAPH}/{leadgen_id}",
            params={"access_token": token, "fields": "field_data,created_time,ad_name,form_id"},
        )
        r.raise_for_status()
        return r.json()


@router.get("")
def verify_webhook(request: Request):
    """FB Webhook verification handshake."""
    params = dict(request.query_params)
    mode      = params.get("hub.mode")
    token     = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == os.getenv("FB_VERIFY_TOKEN", "melvin_webhook_secret"):
        return int(challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("")
async def receive_lead(request: Request, db: Session = Depends(get_db)):
    """Receive new lead notification from Facebook Lead Ads."""
    body  = await request.json()
    token = os.getenv("FB_PAGE_ACCESS_TOKEN", "")

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                continue

            value      = change.get("value", {})
            leadgen_id = str(value.get("leadgen_id", ""))
            ad_name    = value.get("ad_name", "")

            if not leadgen_id:
                continue

            # Deduplicate
            if db.query(Lead).filter(Lead.fb_lead_id == leadgen_id).first():
                continue

            # Fetch actual field data from Graph API
            fields = {}
            if token:
                try:
                    data    = await _fetch_lead(leadgen_id, token)
                    fields  = _fields_to_dict(data.get("field_data", []))
                    ad_name = ad_name or data.get("ad_name", "")
                except Exception:
                    pass  # still create the lead shell so we don't lose it

            # Name
            name = (
                fields.get("full_name")
                or fields.get("name")
                or f"{fields.get('first_name', '')} {fields.get('last_name', '')}".strip()
                or "Unknown"
            )

            # Budget — FB custom questions can use various field names
            budget = (
                fields.get("budget")
                or fields.get("budget_range")
                or fields.get("renovation_budget")
                or fields.get("project_budget")
            )

            # Location / property
            location = (
                fields.get("location")
                or fields.get("property_address")
                or fields.get("property_location")
                or fields.get("area")
                or fields.get("city")
            )

            # Project type mapping
            raw_type = (fields.get("project_type") or fields.get("property_type") or "").lower()
            if "commercial" in raw_type:
                project_type = "commercial"
            elif raw_type:
                project_type = "residential"
            else:
                project_type = None

            # Notes: gather any free-text answers
            note_parts = [v for k, v in fields.items()
                          if k in ("comments", "message", "questions", "notes", "anything_else") and v]
            notes = "\n".join(note_parts) or None

            lead = Lead(
                full_name=name,
                phone=fields.get("phone_number") or fields.get("phone") or None,
                email=fields.get("email") or None,
                budget=budget,
                location=location,
                project_type=project_type,
                request_notes=notes,
                source_channel="fb_ads",
                fb_campaign=ad_name,
                fb_lead_id=leadgen_id,
                status="new",
            )
            db.add(lead)
            db.flush()

            db.add(StatusLog(
                lead_id=lead.id,
                from_status=None,
                to_status="new",
                note=f"Auto-created via FB Lead Ads — {ad_name}",
            ))

    db.commit()
    return {"status": "ok"}
