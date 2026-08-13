"""Quotation preset packages — reusable templates saved from the quote form.

kind="quote": a whole-quotation template (all sections + groups + items)
kind="group": a single named bundle you insert into any section
The `data` column stores an opaque JSON blob the frontend round-trips.
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import QuotePackage
from auth import get_current_user, require_write

router = APIRouter(prefix="/packages", tags=["packages"])

VALID_KINDS = ("quote", "group")


class PackageIn(BaseModel):
    name: str
    kind: str = "quote"
    category: str | None = None
    subtitle: str | None = None
    data: dict


class PackageUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    subtitle: str | None = None
    data: dict | None = None


def _dict(p: QuotePackage) -> dict:
    try:
        data = json.loads(p.data) if p.data else {}
    except (ValueError, TypeError):
        data = {}
    return {
        "id": p.id, "name": p.name, "kind": p.kind,
        "category": p.category, "subtitle": p.subtitle, "data": data,
        "sort_order": p.sort_order, "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("")
def list_packages(kind: str | None = None, db: Session = Depends(get_db),
                  user: dict = Depends(get_current_user)):
    q = db.query(QuotePackage)
    if kind in VALID_KINDS:
        q = q.filter(QuotePackage.kind == kind)
    return [_dict(p) for p in q.order_by(QuotePackage.sort_order, QuotePackage.name).all()]


@router.post("", status_code=201)
def create_package(body: PackageIn, db: Session = Depends(get_db),
                   user: dict = Depends(require_write)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Package name is required")
    kind = body.kind if body.kind in VALID_KINDS else "quote"
    category = (body.category or "").strip() or None
    subtitle = (body.subtitle or "").strip() or None
    # Overwrite a same name + kind + category package so re-saving updates in place
    existing = (db.query(QuotePackage)
                .filter(QuotePackage.kind == kind, QuotePackage.name == name,
                        QuotePackage.category == category)
                .first())
    if existing:
        existing.data = json.dumps(body.data)
        existing.subtitle = subtitle
        existing.created_by = user["username"]
        db.commit()
        db.refresh(existing)
        return _dict(existing)
    next_order = (db.query(func.max(QuotePackage.sort_order)).scalar() or 0) + 1
    p = QuotePackage(name=name, kind=kind, category=category, subtitle=subtitle,
                     data=json.dumps(body.data), sort_order=next_order,
                     created_by=user["username"])
    db.add(p)
    db.commit()
    db.refresh(p)
    return _dict(p)


@router.patch("/{package_id}")
def update_package(package_id: int, body: PackageUpdate, db: Session = Depends(get_db),
                   user: dict = Depends(require_write)):
    p = db.get(QuotePackage, package_id)
    if not p:
        raise HTTPException(404, "Package not found")
    if body.name is not None:
        n = body.name.strip()
        if n:
            p.name = n
    if body.category is not None:
        p.category = body.category.strip() or None
    if body.subtitle is not None:
        p.subtitle = body.subtitle.strip() or None
    if body.data is not None:
        p.data = json.dumps(body.data)
    p.created_by = user["username"]
    db.commit()
    db.refresh(p)
    return _dict(p)


class ReorderRow(BaseModel):
    id: int
    category: str | None = None
    sort_order: int = 0


@router.post("/reorder")
def reorder_packages(rows: list[ReorderRow], db: Session = Depends(get_db),
                     user: dict = Depends(require_write)):
    """Persist a drag: set each package's category + sort_order in one commit.
    Unknown ids are ignored so a stale client can't 500 the whole batch."""
    updated = 0
    for row in rows:
        p = db.get(QuotePackage, row.id)
        if not p:
            continue
        p.category = (row.category or "").strip() or None
        p.sort_order = row.sort_order
        updated += 1
    db.commit()
    return {"ok": True, "updated": updated}


@router.delete("/{package_id}", status_code=204)
def delete_package(package_id: int, db: Session = Depends(get_db),
                   user: dict = Depends(require_write)):
    p = db.get(QuotePackage, package_id)
    if not p:
        raise HTTPException(404, "Package not found")
    db.delete(p)
    db.commit()
