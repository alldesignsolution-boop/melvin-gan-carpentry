from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Float
from database import get_db
from models import Lead, VALID_STATUSES
from auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

STATUS_LABELS = {
    "new":                 "New Lead",
    "contacted":           "Contacted",
    "site_visit":          "Site Visit",
    "quoted":              "Quoted",
    "negotiating":         "Negotiating",
    "late_key_collection": "Late Key Collection",
    "won":                 "Won",
    "lost":                "Lost",
}

SOURCE_LABELS = {
    "fb_ads":    "FB Ads",
    "tiktok_ads":"TikTok Ads",
    "referral":  "Referral",
    "website":   "Website",
    "other":     "Other",
}


def _base_query(db: Session, user: dict):
    q = db.query(Lead)
    if user["role"] != "admin":
        q = q.filter(Lead.assigned_to == user["username"])
    return q


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    base = _base_query(db, user)

    total_leads   = base.count()
    monthly_leads = base.filter(Lead.created_at >= month_start).count()
    won_count     = base.filter(Lead.status == "won").count()
    conversion_rate = round((won_count / total_leads * 100), 1) if total_leads else 0
    won_value_total = db.query(func.sum(Lead.deal_value)).filter(Lead.status == "won").scalar() or 0
    if user["role"] != "admin":
        won_value_total = db.query(func.sum(Lead.deal_value)).filter(Lead.status == "won", Lead.assigned_to == user["username"]).scalar() or 0

    pipeline = [
        {"status": s, "label": STATUS_LABELS.get(s, s), "count": base.filter(Lead.status == s).count()}
        for s in VALID_STATUSES
    ]

    # Leads by source channel
    by_source = (
        base.with_entities(Lead.source_channel, func.count(Lead.id).label("n"))
        .group_by(Lead.source_channel)
        .all()
    )
    source_breakdown = [
        {"source": SOURCE_LABELS.get(r.source_channel or "other", r.source_channel or "Unknown"), "count": r.n}
        for r in by_source
    ]

    # Lost reason distribution
    lost_dist = (
        base.filter(Lead.status == "lost")
        .with_entities(Lead.lost_reason, func.count(Lead.id).label("n"))
        .group_by(Lead.lost_reason)
        .all()
    )
    lost_reasons = [{"reason": r.lost_reason or "other", "count": r.n} for r in lost_dist]

    # 6-month trend
    monthly_trend = []
    for i in range(5, -1, -1):
        dt = now - timedelta(days=30 * i)
        m_start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        m_end = m_start.replace(month=m_start.month % 12 + 1) if m_start.month < 12 \
            else m_start.replace(year=m_start.year + 1, month=1)
        c_leads = base.filter(Lead.created_at >= m_start, Lead.created_at < m_end).count()
        c_won   = base.filter(Lead.created_at >= m_start, Lead.created_at < m_end, Lead.status == "won").count()
        monthly_trend.append({"month": m_start.strftime("%b %Y"), "leads": c_leads, "won": c_won})

    return {
        "total_leads":      total_leads,
        "monthly_leads":    monthly_leads,
        "won_count":        won_count,
        "conversion_rate":  conversion_rate,
        "pipeline":         pipeline,
        "source_breakdown": source_breakdown,
        "lost_reasons":     lost_reasons,
        "monthly_trend":    monthly_trend,
        "won_value_total":  int(won_value_total),
        "user_role":        user["role"],
        "username":         user["username"],
    }
