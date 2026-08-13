from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import nullslast
from pydantic import BaseModel
from database import get_db
from models import Lead, StatusLog, VALID_STATUSES, LOST_REASONS
from auth import get_current_user, require_write

router = APIRouter(prefix="/leads", tags=["leads"])


class LeadCreate(BaseModel):
    full_name: str
    phone: str | None = None
    email: str | None = None
    location: str | None = None
    budget: str | None = None
    request_notes: str | None = None
    assigned_to: str | None = None
    source_channel: str | None = None
    project_type: str | None = None
    fb_campaign: str | None = None
    fb_lead_id: str | None = None
    area: str | None = None


class LeadUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    location: str | None = None
    budget: str | None = None
    request_notes: str | None = None
    assigned_to: str | None = None
    source_channel: str | None = None
    project_type: str | None = None
    last_follow_up: str | None = None  # ISO datetime string
    follow_up_note: str | None = None
    appointment_at: str | None = None  # ISO datetime string
    followup_flag: bool | None = None
    deal_value: int | None = None
    quote_id: str | None = None
    area: str | None = None


class BulkSort(BaseModel):
    ids: list[int]


class StatusUpdate(BaseModel):
    status: str
    note: str | None = None
    lost_reason: str | None = None
    deal_value: int | None = None
    appointment_at: str | None = None  # ISO datetime string


def _lead_dict(l: Lead) -> dict:
    return {
        "id": l.id, "full_name": l.full_name, "phone": l.phone, "email": l.email,
        "location": l.location, "budget": l.budget, "request_notes": l.request_notes,
        "status": l.status, "lost_reason": l.lost_reason,
        "source_channel": l.source_channel, "project_type": l.project_type,
        "assigned_to": l.assigned_to, "fb_campaign": l.fb_campaign, "fb_lead_id": l.fb_lead_id,
        "quote_id": l.quote_id, "followup_flag": l.followup_flag, "deal_value": l.deal_value,
        "appointment_at": l.appointment_at.isoformat() if l.appointment_at else None,
        "area": l.area,
        "status_changed_at": l.status_changed_at.isoformat() if l.status_changed_at else None,
        "last_follow_up": l.last_follow_up.isoformat() if l.last_follow_up else None,
        "follow_up_note": l.follow_up_note,
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "updated_at": l.updated_at.isoformat() if l.updated_at else None,
    }


def _apply_role_filter(q, user: dict):
    if user["role"] != "admin":
        q = q.filter(Lead.assigned_to == user["username"])
    return q


@router.get("")
def list_leads(
    status: str | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    q = db.query(Lead)
    # All authenticated users see all leads — role filter removed
    if status:
        q = q.filter(Lead.status == status)
    if source:
        q = q.filter(Lead.source_channel == source)
    return [_lead_dict(l) for l in q.order_by(nullslast(Lead.sort_order), Lead.created_at.desc()).all()]


@router.post("", status_code=201)
def create_lead(
    data: LeadCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    lead = Lead(**data.model_dump())
    # Auto-assign to creator if not admin assigning to someone else
    if not lead.assigned_to:
        lead.assigned_to = user["username"]
    db.add(lead)
    db.commit()
    db.refresh(lead)
    db.add(StatusLog(lead_id=lead.id, from_status=None, to_status="new"))
    db.commit()
    db.refresh(lead)
    return _lead_dict(lead)


@router.post("/bulk-sort")
def bulk_sort_leads(
    data: BulkSort,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    for idx, lead_id in enumerate(data.ids):
        lead = db.get(Lead, lead_id)
        if lead:
            lead.sort_order = idx
    db.commit()
    return {"ok": True}


@router.get("/{lead_id}")
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return _lead_dict(lead)


@router.patch("/{lead_id}")
def update_lead(
    lead_id: int,
    data: LeadUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user["role"] != "admin" and lead.assigned_to != user["username"]:
        raise HTTPException(status_code=403, detail="Not your lead")

    update_data = data.model_dump(exclude_unset=True)
    for field in ("last_follow_up", "appointment_at"):
        if field in update_data:
            if update_data[field] is None:
                pass  # allow null to clear the field
            else:
                try:
                    update_data[field] = datetime.fromisoformat(update_data[field].replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    del update_data[field]

    for key, value in update_data.items():
        setattr(lead, key, value)

    # Record a saved Follow-up in the Status History timeline, dated at the
    # follow-up time. A follow-up save is identified by last_follow_up being
    # present (only saveFollowUp sends it); other PATCHes are unaffected.
    if update_data.get("last_follow_up"):
        db.add(StatusLog(
            lead_id=lead.id,
            from_status=None,
            to_status="follow_up",
            changed_at=update_data["last_follow_up"],
            note=update_data.get("follow_up_note") or None,
        ))

    lead.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lead)
    return _lead_dict(lead)


@router.patch("/{lead_id}/status")
def update_status(
    lead_id: int,
    data: StatusUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {VALID_STATUSES}")
    if data.status == "lost" and not data.lost_reason:
        raise HTTPException(status_code=400, detail="lost_reason is required when marking as lost")
    if data.lost_reason and data.lost_reason not in LOST_REASONS:
        raise HTTPException(status_code=400, detail=f"Invalid lost_reason. Must be one of: {LOST_REASONS}")

    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user["role"] != "admin" and lead.assigned_to != user["username"]:
        raise HTTPException(status_code=403, detail="Not your lead")

    db.add(StatusLog(lead_id=lead.id, from_status=lead.status, to_status=data.status, note=data.note))
    lead.status = data.status
    lead.status_changed_at = datetime.now(timezone.utc)
    lead.followup_flag = False  # clear flag when status moves
    if data.lost_reason:
        lead.lost_reason = data.lost_reason
    if data.deal_value is not None:
        lead.deal_value = data.deal_value
    if data.appointment_at:
        try:
            lead.appointment_at = datetime.fromisoformat(data.appointment_at.replace("Z", "+00:00"))
        except ValueError:
            pass
    lead.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lead)
    return _lead_dict(lead)


@router.get("/{lead_id}/logs")
def get_status_logs(
    lead_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead.status_logs


@router.delete("/{lead_id}", status_code=204)
def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    from models import Quote, Invoice
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Detach any quotes/invoices instead of cascade-deleting them
    db.query(Quote).filter(Quote.lead_id == lead_id).update({Quote.lead_id: None})
    db.query(Invoice).filter(Invoice.lead_id == lead_id).update({Invoice.lead_id: None})
    db.delete(lead)  # status_logs cascade via relationship
    db.commit()
    return
