from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import nullslast
from pydantic import BaseModel
from database import get_db
from models import Checklist, ChecklistItem, Lead
from auth import get_current_user, require_write

router = APIRouter(prefix="/checklists", tags=["checklists"])

VALID_COLORS = {"white", "beige", "sand", "green", "peach", "blue"}


# ── Schemas ──────────────────────────────────────────────────────────────────
class ChecklistCreate(BaseModel):
    title: str = ""
    color: str = "white"
    pinned: bool = False
    lead_id: int | None = None
    items: list[str] = []


class ChecklistUpdate(BaseModel):
    title: str | None = None
    color: str | None = None
    pinned: bool | None = None
    lead_id: int | None = None
    clear_lead: bool = False   # explicit unlink (lead_id=None is ambiguous in PATCH)


class ItemCreate(BaseModel):
    text: str = ""
    done: bool = False


class ItemUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None


class ReorderIn(BaseModel):
    ids: list[int]


# ── Serialisers ──────────────────────────────────────────────────────────────
def _item_dict(i: ChecklistItem) -> dict:
    return {"id": i.id, "text": i.text, "done": i.done, "sort_order": i.sort_order}


def _dict(c: Checklist, lead_name: str | None = None) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "color": c.color,
        "pinned": c.pinned,
        "lead_id": c.lead_id,
        "lead_name": lead_name,
        "created_by": c.created_by,
        "sort_order": c.sort_order,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "items": [_item_dict(i) for i in c.items],
    }


def _lead_names(db: Session, checklists: list[Checklist]) -> dict[int, str]:
    ids = {c.lead_id for c in checklists if c.lead_id}
    if not ids:
        return {}
    return {l.id: l.full_name for l in db.query(Lead).filter(Lead.id.in_(ids)).all()}


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("")
def list_checklists(
    lead_id: int | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    q = db.query(Checklist)
    if lead_id is not None:
        q = q.filter(Checklist.lead_id == lead_id)
    # Pinned first, then custom order, then newest.
    rows = q.order_by(
        Checklist.pinned.desc(),
        nullslast(Checklist.sort_order),
        Checklist.updated_at.desc(),
    ).all()
    names = _lead_names(db, rows)
    return [_dict(c, names.get(c.lead_id)) for c in rows]


@router.post("", status_code=201)
def create_checklist(
    data: ChecklistCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    if data.color not in VALID_COLORS:
        data.color = "white"
    if data.lead_id is not None and not db.get(Lead, data.lead_id):
        raise HTTPException(404, "Lead not found")
    c = Checklist(
        title=data.title.strip(),
        color=data.color,
        pinned=data.pinned,
        lead_id=data.lead_id,
        created_by=user["username"],
    )
    for idx, txt in enumerate(data.items):
        txt = txt.strip()
        if txt:
            c.items.append(ChecklistItem(text=txt, sort_order=idx))
    db.add(c)
    db.commit()
    db.refresh(c)
    names = _lead_names(db, [c])
    return _dict(c, names.get(c.lead_id))


@router.patch("/{checklist_id}")
def update_checklist(
    checklist_id: int,
    data: ChecklistUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    c = db.get(Checklist, checklist_id)
    if not c:
        raise HTTPException(404, "Checklist not found")
    if data.title is not None:
        c.title = data.title.strip()
    if data.color is not None and data.color in VALID_COLORS:
        c.color = data.color
    if data.pinned is not None:
        c.pinned = data.pinned
    if data.clear_lead:
        c.lead_id = None
    elif data.lead_id is not None:
        if not db.get(Lead, data.lead_id):
            raise HTTPException(404, "Lead not found")
        c.lead_id = data.lead_id
    c.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    names = _lead_names(db, [c])
    return _dict(c, names.get(c.lead_id))


@router.delete("/{checklist_id}", status_code=204)
def delete_checklist(
    checklist_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    c = db.get(Checklist, checklist_id)
    if not c:
        raise HTTPException(404, "Checklist not found")
    db.delete(c)
    db.commit()


@router.post("/reorder")
def reorder_checklists(
    data: ReorderIn,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    for idx, cid in enumerate(data.ids):
        c = db.get(Checklist, cid)
        if c:
            c.sort_order = idx
    db.commit()
    return {"ok": True}


# ── Items ────────────────────────────────────────────────────────────────────
@router.post("/{checklist_id}/items", status_code=201)
def add_item(
    checklist_id: int,
    data: ItemCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    c = db.get(Checklist, checklist_id)
    if not c:
        raise HTTPException(404, "Checklist not found")
    next_order = (max((i.sort_order for i in c.items), default=-1)) + 1
    item = ChecklistItem(checklist_id=checklist_id, text=data.text.strip(),
                         done=data.done, sort_order=next_order)
    db.add(item)
    c.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _item_dict(item)


@router.patch("/items/{item_id}")
def update_item(
    item_id: int,
    data: ItemUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    item = db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if data.text is not None:
        item.text = data.text.strip()
    if data.done is not None:
        item.done = data.done
    parent = db.get(Checklist, item.checklist_id)
    if parent:
        parent.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _item_dict(item)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    item = db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()


@router.post("/{checklist_id}/items/reorder")
def reorder_items(
    checklist_id: int,
    data: ReorderIn,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    for idx, iid in enumerate(data.ids):
        item = db.get(ChecklistItem, iid)
        if item and item.checklist_id == checklist_id:
            item.sort_order = idx
    db.commit()
    return {"ok": True}
