from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response as HTTPResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import Quote, QuoteItem, Invoice, Lead, Counter
from auth import get_current_user, require_write

router = APIRouter(prefix="/quotes", tags=["quotes"])

VALID_STATUSES = ["draft", "sent", "negotiating", "accepted", "rejected"]
VALID_PAYMENT  = ["unpaid", "partial", "paid"]


def _next_number(db: Session, counter_name: str, prefix: str) -> str:
    year = datetime.now().year
    counter = db.query(Counter).filter(Counter.name == counter_name).first()
    if not counter:
        counter = Counter(name=counter_name, value=0)
        db.add(counter)
    counter.value += 1
    db.flush()
    return f"{prefix}{year}-{counter.value:04d}"


class ItemIn(BaseModel):
    category: str = "misc"
    group_name: str | None = None
    description: str
    details: str | None = None
    uom: str | None = None
    qty: float = 1.0
    unit_price: float = 0.0
    sort_order: int = 0


class QuoteCreate(BaseModel):
    lead_id: int | None = None
    client_name: str
    client_phone: str | None = None
    project_address: str | None = None
    project_type: str | None = None
    size_range: str | None = None
    design_theme: str | None = None
    condo_name: str | None = None
    ic_number: str | None = None
    customer_address: str | None = None
    valid_until: str | None = None
    terms_notes: str | None = None
    sst_rate: float = 0.06
    items: list[ItemIn] = []


class QuoteUpdate(BaseModel):
    client_name: str | None = None
    client_phone: str | None = None
    project_address: str | None = None
    project_type: str | None = None
    size_range: str | None = None
    design_theme: str | None = None
    condo_name: str | None = None
    ic_number: str | None = None
    customer_address: str | None = None
    valid_until: str | None = None
    terms_notes: str | None = None
    sst_rate: float | None = None
    status: str | None = None
    items: list[ItemIn] | None = None


def _recalc(quote: Quote, items: list[QuoteItem]):
    for item in items:
        item.subtotal = round(item.qty * item.unit_price, 2)
    quote.subtotal   = round(sum(i.subtotal for i in items), 2)
    quote.sst_amount = round(quote.subtotal * quote.sst_rate, 2)
    quote.total      = round(quote.subtotal + quote.sst_amount, 2)


def _quote_dict(q: Quote) -> dict:
    return {
        "id": q.id, "quote_number": q.quote_number, "lead_id": q.lead_id,
        "client_name": q.client_name, "client_phone": q.client_phone,
        "project_address": q.project_address, "project_type": q.project_type,
        "size_range": q.size_range, "design_theme": q.design_theme, "condo_name": q.condo_name,
        "ic_number": q.ic_number, "customer_address": q.customer_address,
        "status": q.status, "valid_until": q.valid_until, "terms_notes": q.terms_notes,
        "sst_rate": q.sst_rate, "subtotal": q.subtotal, "sst_amount": q.sst_amount,
        "total": q.total, "is_locked": q.is_locked, "created_by": q.created_by,
        "created_at": q.created_at.isoformat() if q.created_at else None,
        "items": [{"id": i.id, "category": i.category, "group_name": i.group_name,
                   "description": i.description, "details": i.details, "uom": i.uom, "qty": i.qty,
                   "unit_price": i.unit_price, "subtotal": i.subtotal,
                   "sort_order": i.sort_order} for i in q.items],
    }


# ── List / Create ──────────────────────────────────────────────────────────────

@router.get("")
def list_quotes(lead_id: int | None = None, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    q = db.query(Quote)
    if lead_id:
        q = q.filter(Quote.lead_id == lead_id)
    elif user["role"] != "admin":
        q = q.filter(Quote.created_by == user["username"])
    return [_quote_dict(qt) for qt in q.order_by(Quote.created_at.desc()).all()]


@router.post("", status_code=201)
def create_quote(data: QuoteCreate, db: Session = Depends(get_db), user: dict = Depends(require_write)):
    import traceback
    try:
        quote_number = _next_number(db, "quote", "QT")
        quote = Quote(
            quote_number=quote_number, lead_id=data.lead_id, client_name=data.client_name,
            client_phone=data.client_phone, project_address=data.project_address,
            project_type=data.project_type, size_range=data.size_range,
            design_theme=data.design_theme, condo_name=data.condo_name,
            ic_number=data.ic_number, customer_address=data.customer_address,
            valid_until=data.valid_until,
            terms_notes=data.terms_notes, sst_rate=data.sst_rate, created_by="Melvin",
        )
        db.add(quote)
        db.flush()

        items = []
        for idx, item_data in enumerate(data.items):
            item = QuoteItem(quote_id=quote.id, sort_order=idx, **item_data.model_dump(exclude={'sort_order'}))
            db.add(item)
            items.append(item)
        db.flush()

        _recalc(quote, items)

        if data.lead_id:
            lead = db.get(Lead, data.lead_id)
            if lead:
                lead.quote_id = quote_number

        db.commit()
        db.refresh(quote)
        return _quote_dict(quote)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}\n{traceback.format_exc()}")


# ── Invoice routes FIRST — must come before /{quote_id} to avoid routing conflict ──

@router.get("/invoice/by-quote/{quote_id}")
def invoice_by_quote(quote_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.quote_id == quote_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return {"id": inv.id, "invoice_number": inv.invoice_number,
            "payment_status": inv.payment_status, "amount_paid": inv.amount_paid, "total": inv.total}


@router.get("/invoice/{inv_id}/pdf")
def invoice_pdf(inv_id: int, hide_unit_price: int = 0, show_contact: int = 0, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    q = db.get(Quote, inv.quote_id)

    class InvoiceDoc:
        pass

    doc = InvoiceDoc()
    for attr in ("quote_number","client_name","client_phone","project_address","project_type",
                 "size_range","design_theme","condo_name","created_by",
                 "ic_number","customer_address","terms_notes","sst_rate","subtotal","sst_amount","total","valid_until"):
        setattr(doc, attr, getattr(q, attr))
    doc.invoice_number = inv.invoice_number

    from services.pdf_quote import generate_quote_pdf
    pdf_bytes = generate_quote_pdf(doc, q.items, hide_unit_price=bool(hide_unit_price),
                                   show_ic_address=bool(show_contact))
    filename = f"{inv.invoice_number}.pdf"
    return HTTPResponse(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.patch("/invoice/{inv_id}/payment")
def update_payment(inv_id: int, data: dict, db: Session = Depends(get_db), user: dict = Depends(require_write)):
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if "payment_status" in data and data["payment_status"] in VALID_PAYMENT:
        inv.payment_status = data["payment_status"]
    if "amount_paid" in data:
        inv.amount_paid = float(data["amount_paid"])
    db.commit()
    return {"id": inv.id, "invoice_number": inv.invoice_number,
            "payment_status": inv.payment_status, "amount_paid": inv.amount_paid, "total": inv.total}


# ── Quote CRUD ─────────────────────────────────────────────────────────────────

class LinkLeadBody(BaseModel):
    lead_id: int | None = None


@router.patch("/{quote_id}/link-lead")
def link_quote_to_lead(
    quote_id: int,
    data: LinkLeadBody,
    db: Session = Depends(get_db),
    user: dict = Depends(require_write),
):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    q.lead_id = data.lead_id
    db.commit()
    return {"ok": True, "quote_id": quote_id, "lead_id": q.lead_id}


@router.get("/{quote_id}")
def get_quote(quote_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    return _quote_dict(q)


@router.delete("/{quote_id}", status_code=204)
def delete_quote(quote_id: int, db: Session = Depends(get_db), user: dict = Depends(require_write)):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    if q.is_locked:
        raise HTTPException(400, "Quote is locked (already converted to invoice)")
    if q.lead_id:
        lead = db.get(Lead, q.lead_id)
        if lead and lead.quote_id == q.quote_number:
            lead.quote_id = None
    db.delete(q)  # items cascade via relationship
    db.commit()
    return


@router.patch("/{quote_id}")
def update_quote(quote_id: int, data: QuoteUpdate, db: Session = Depends(get_db), user: dict = Depends(require_write)):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    if q.is_locked:
        raise HTTPException(400, "Quote is locked (converted to invoice)")

    for field in ("client_name","client_phone","project_address","project_type","size_range","design_theme","condo_name","ic_number","customer_address","valid_until","terms_notes","sst_rate","status"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(q, field, val)

    if data.items is not None:
        for old in list(q.items):
            db.delete(old)
        db.flush()
        items = []
        for idx, item_data in enumerate(data.items):
            item = QuoteItem(quote_id=q.id, sort_order=idx, **item_data.model_dump(exclude={'sort_order'}))
            db.add(item)
            items.append(item)
        db.flush()
        _recalc(q, items)

    q.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(q)
    return _quote_dict(q)


@router.get("/{quote_id}/pdf")
def download_pdf(quote_id: int, hide_unit_price: int = 0, proforma: int = 0, show_contact: int = 0,
                 db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    from services.pdf_quote import generate_quote_pdf
    # proforma=1 renders the same quote as a Proforma Invoice; IC/Customer Address
    # are only included when show_contact=1 (hidden by default).
    doc_type = "PROFORMA INVOICE" if proforma else None
    pdf_bytes = generate_quote_pdf(q, q.items, hide_unit_price=bool(hide_unit_price),
                                   doc_type=doc_type, show_ic_address=bool(proforma and show_contact))
    prefix = "Proforma-" if proforma else ""
    filename = f"{prefix}{q.quote_number}.pdf"
    return HTTPResponse(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/{quote_id}/convert-to-invoice", status_code=201)
def convert_to_invoice(quote_id: int, db: Session = Depends(get_db), user: dict = Depends(require_write)):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    if q.is_locked:
        raise HTTPException(400, "Already converted to invoice")

    inv_number = _next_number(db, "invoice", "INV")
    inv = Invoice(invoice_number=inv_number, quote_id=q.id, lead_id=q.lead_id, total=q.total)
    db.add(inv)
    q.is_locked = True
    q.status = "accepted"
    # A successful proforma invoice sets the linked lead's deal value automatically.
    if q.lead_id:
        lead = db.get(Lead, q.lead_id)
        if lead:
            lead.deal_value = round(q.total)
    db.commit()
    db.refresh(inv)
    return {"invoice_number": inv.invoice_number, "invoice_id": inv.id, "total": inv.total}


@router.post("/{quote_id}/unlock")
def unlock_quote(quote_id: int, db: Session = Depends(get_db), user: dict = Depends(require_write)):
    """Revert a proforma-invoice conversion so the quotation can be edited again."""
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    # Remove the proforma invoice record(s) created by conversion and re-open editing
    for inv in db.query(Invoice).filter(Invoice.quote_id == q.id).all():
        db.delete(inv)
    q.is_locked = False
    # Reverting the proforma invoice clears the auto-set deal value on the lead.
    if q.lead_id:
        lead = db.get(Lead, q.lead_id)
        if lead:
            lead.deal_value = None
    db.commit()
    return {"ok": True, "quote_id": quote_id, "is_locked": False}
