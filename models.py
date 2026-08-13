from datetime import datetime, timezone
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

VALID_STATUSES = [
    "new",
    "contacted",
    "site_visit",
    "quoted",
    "negotiating",
    "late_key_collection",
    "won",
    "lost",
]

LOST_REASONS = [
    "price_too_high",
    "chose_competitor",
    "project_cancelled",
    "no_response",
    "other",
]

SOURCE_CHANNELS = [
    "fb_ads",
    "tiktok_ads",
    "referral",
    "website",
    "other",
]

PROJECT_TYPES = ["residential", "commercial"]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="sales")  # admin | sales
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(300))
    budget: Mapped[str | None] = mapped_column(String(100))
    request_notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="new")
    lost_reason: Mapped[str | None] = mapped_column(String(100))
    source_channel: Mapped[str | None] = mapped_column(String(50))
    project_type: Mapped[str | None] = mapped_column(String(50))
    assigned_to: Mapped[str | None] = mapped_column(String(100))
    last_follow_up: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    follow_up_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    fb_campaign: Mapped[str | None] = mapped_column(String(200))
    fb_lead_id: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    quote_id: Mapped[str | None] = mapped_column(String(50))
    followup_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deal_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    appointment_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    area: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    status_logs: Mapped[list["StatusLog"]] = relationship("StatusLog", back_populates="lead", cascade="all, delete")


class Counter(Base):
    __tablename__ = "counters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    value: Mapped[int] = mapped_column(Integer, default=0)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String(50))
    room: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(300))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    uom: Mapped[str | None] = mapped_column(String(20))
    price: Mapped[float] = mapped_column(default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Quote(Base):
    __tablename__ = "quotes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quote_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    lead_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("leads.id"), nullable=True)
    client_name: Mapped[str] = mapped_column(String(200))
    client_phone: Mapped[str | None] = mapped_column(String(50))
    project_address: Mapped[str | None] = mapped_column(String(300))
    project_type: Mapped[str | None] = mapped_column(String(50))
    size_range: Mapped[str | None] = mapped_column(String(50))         # unit size band
    design_theme: Mapped[str | None] = mapped_column(String(120))
    condo_name: Mapped[str | None] = mapped_column(String(150))
    ic_number: Mapped[str | None] = mapped_column(String(50))          # customer IC — proforma invoice only
    customer_address: Mapped[str | None] = mapped_column(String(300))  # billing address — proforma invoice only
    status: Mapped[str] = mapped_column(String(30), default="draft")
    valid_until: Mapped[str | None] = mapped_column(String(20))
    terms_notes: Mapped[str | None] = mapped_column(Text)
    sst_rate: Mapped[float] = mapped_column(default=0.06)
    subtotal: Mapped[float] = mapped_column(default=0.0)
    sst_amount: Mapped[float] = mapped_column(default=0.0)
    total: Mapped[float] = mapped_column(default=0.0)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    items: Mapped[list["QuoteItem"]] = relationship("QuoteItem", back_populates="quote", cascade="all, delete", order_by="QuoteItem.sort_order")


class QuoteItem(Base):
    __tablename__ = "quote_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quote_id: Mapped[int] = mapped_column(Integer, ForeignKey("quotes.id"))
    category: Mapped[str] = mapped_column(String(50), default="construction")
    group_name: Mapped[str | None] = mapped_column(String(120), nullable=True)  # sub-group within a category
    description: Mapped[str] = mapped_column(String(300))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)  # per-quote spec text (seeded from product SKU, editable)
    uom: Mapped[str | None] = mapped_column(String(20))
    qty: Mapped[float] = mapped_column(default=1.0)
    unit_price: Mapped[float] = mapped_column(default=0.0)
    subtotal: Mapped[float] = mapped_column(default=0.0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    quote: Mapped["Quote"] = relationship("Quote", back_populates="items")


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invoice_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    quote_id: Mapped[int] = mapped_column(Integer, ForeignKey("quotes.id"))
    lead_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("leads.id"), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(30), default="unpaid")
    amount_paid: Mapped[float] = mapped_column(default=0.0)
    total: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class StatusLog(Base):
    __tablename__ = "status_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lead_id: Mapped[int] = mapped_column(Integer, ForeignKey("leads.id"))
    from_status: Mapped[str | None] = mapped_column(String(50))
    to_status: Mapped[str] = mapped_column(String(50))
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    note: Mapped[str | None] = mapped_column(Text)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="status_logs")


# ── Preset library (quotation shortcuts) ─────────────────────────────────────
class PresetArea(Base):
    __tablename__ = "preset_areas"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    target_room: Mapped[str] = mapped_column(String(80))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    subs: Mapped[list["PresetSubArea"]] = relationship(
        "PresetSubArea", back_populates="area",
        cascade="all, delete-orphan", order_by="PresetSubArea.sort_order",
    )


class PresetSubArea(Base):
    __tablename__ = "preset_sub_areas"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    area_id: Mapped[int] = mapped_column(Integer, ForeignKey("preset_areas.id"))
    name: Mapped[str] = mapped_column(String(80))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    area: Mapped["PresetArea"] = relationship("PresetArea", back_populates="subs")
    sets: Mapped[list["PresetSet"]] = relationship(
        "PresetSet", back_populates="sub_area",
        cascade="all, delete-orphan", order_by="PresetSet.sort_order",
    )


class PresetSet(Base):
    __tablename__ = "preset_sets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sub_area_id: Mapped[int] = mapped_column(Integer, ForeignKey("preset_sub_areas.id"))
    name: Mapped[str] = mapped_column(String(120))
    run_ft: Mapped[float | None] = mapped_column(nullable=True)
    category: Mapped[str] = mapped_column(String(20), default="construction")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    sub_area: Mapped["PresetSubArea"] = relationship("PresetSubArea", back_populates="sets")
    items: Mapped[list["PresetItem"]] = relationship(
        "PresetItem", back_populates="set",
        cascade="all, delete-orphan", order_by="PresetItem.sort_order",
    )


class PresetItem(Base):
    __tablename__ = "preset_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    set_id: Mapped[int] = mapped_column(Integer, ForeignKey("preset_sets.id"))
    description: Mapped[str] = mapped_column(String(300))
    uom: Mapped[str] = mapped_column(String(20), default="")
    is_per_ft: Mapped[bool] = mapped_column(Boolean, default=False)
    qty: Mapped[float] = mapped_column(default=1.0)
    unit_price: Mapped[float] = mapped_column(default=0.0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    set: Mapped["PresetSet"] = relationship("PresetSet", back_populates="items")


# ── Checklists (Google Keep–style notes, shared across all users) ─────────────
class Checklist(Base):
    __tablename__ = "checklists"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    color: Mapped[str] = mapped_column(String(20), default="white")   # card colour key
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    lead_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("leads.id"), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    items: Mapped[list["ChecklistItem"]] = relationship(
        "ChecklistItem", back_populates="checklist",
        cascade="all, delete-orphan", order_by="ChecklistItem.sort_order")


class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    checklist_id: Mapped[int] = mapped_column(Integer, ForeignKey("checklists.id"))
    text: Mapped[str] = mapped_column(String(500), default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    checklist: Mapped["Checklist"] = relationship("Checklist", back_populates="items")


# ── Quotation preset packages (reusable templates saved from the quote form) ──
# kind = "quote" : a whole-quotation template (all sections + groups + items)
# kind = "group" : a single named bundle you drop into any section
class QuotePackage(Base):
    __tablename__ = "quote_packages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(20), default="quote")
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)   # Condominium | Landed | …
    subtitle: Mapped[str | None] = mapped_column(String(200), nullable=True)  # e.g. "1,000–1,200 sqft · 2 rooms"
    data: Mapped[str] = mapped_column(Text)  # JSON blob describing the package
    sort_order: Mapped[int] = mapped_column(Integer, default=0)  # custom drag order within the Library
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
