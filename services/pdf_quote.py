"""PDF generation for quotes and invoices using fpdf2."""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from datetime import datetime

CATEGORIES = {"design": "Design Fee", "construction": "Construction / Material", "misc": "Miscellaneous"}
# Beige theme, matched to the app nav: band #7a6352, tint #f0ebe1, stripe #f7f4ef.
TAUPE = (122, 99, 82)
LIGHT_BEIGE = (240, 235, 225)
PALE_BEIGE = (250, 247, 242)
GRAY = (100, 100, 100)
LIGHT_GRAY = (247, 244, 239)
# Match the on-screen quotation preview (quote_detail.html): dark header row #1a1a2e,
# muted group text #8a7364, hairline row separator #f0f0f5.
NAVY = (26, 26, 46)
MUTED = (138, 115, 100)
ROW_BORDER = (240, 240, 245)
# Item-table column header: light grey band w/ black text (description isn't the
# emphasis, so no full-contrast highlight). Category band: dark grey w/ white text.
HEADER_GRAY = (224, 224, 224)
CAT_DARK = (78, 78, 78)
# Top brand band: light grey base w/ black text (was taupe/white).
BRAND_GRAY = (232, 232, 232)

# Core fonts render Windows-1252 (cp1252), which — unlike Latin-1 — includes the
# bullet (•), curly quotes and en/em dashes, so terms lists no longer turn into "?".
def _safe(text) -> str:
    return str(text or "").encode("cp1252", "replace").decode("cp1252")


class QuotePDF(FPDF):
    def __init__(self, doc_type="QUOTATION"):
        super().__init__()
        self.core_fonts_encoding = "cp1252"
        self.doc_type = doc_type
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        self.set_fill_color(*BRAND_GRAY)
        self.rect(0, 0, 210, 32, "F")
        self.set_text_color(0, 0, 0)
        # Brand (left)
        self.set_font("Helvetica", "B", 18)
        self.set_xy(14, 7)
        self.cell(90, 10, "HOGA SPACE", new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_font("Helvetica", "", 9)
        self.set_xy(14, 17)
        self.cell(90, 6, "Interior Design & Renovation", new_x=XPos.RIGHT, new_y=YPos.TOP)
        # Doc type + payment details (right)
        self.set_font("Helvetica", "B", 14)
        self.set_xy(106, 6)
        self.cell(90, 8, self.doc_type, align="R", new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.set_font("Helvetica", "", 7.5)
        self.set_xy(106, 16)
        self.cell(90, 4, _safe("Payment Details: MORDEZ SDN BHD"), align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.set_xy(106, 20)
        self.cell(90, 4, _safe("Bank: MAYBANK (A/C: 5643 9720 3875)"), align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.set_text_color(0, 0, 0)
        self.set_y(38)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 5, _safe("Melvin Gan Carpentry  •  RESIDENTIAL DESIGN & BUILD"), align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def section_header(self, title):
        # No background band — just a taupe bold label (Document Info / Bill To / Terms).
        self.set_text_color(*TAUPE)
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 7, _safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(0, 0, 0)

    def category_header(self, title):
        self.set_fill_color(*CAT_DARK)
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 7, "  " + _safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.set_text_color(0, 0, 0)

    def group_header(self, title):
        self.set_fill_color(*PALE_BEIGE)
        self.set_text_color(*MUTED)
        self.set_font("Helvetica", "B", 7.5)
        self.cell(0, 6, "  " + _safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.set_text_color(0, 0, 0)

    def kv_row(self, label, value, w1=45):
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*GRAY)
        self.cell(w1, 6, _safe(label), new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(0, 0, 0)
        self.multi_cell(0, 6, _safe(str(value) if value else "-"),
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def generate_quote_pdf(quote, items, hide_unit_price: bool = False,
                       doc_type: str | None = None, show_ic_address: bool = False) -> bytes:
    # doc_type: pass e.g. "PROFORMA INVOICE" to override; otherwise auto-detect.
    # A converted invoice is titled PROFORMA INVOICE (renamed from INVOICE).
    if not doc_type:
        doc_type = "PROFORMA INVOICE" if getattr(quote, "invoice_number", None) else "QUOTATION"
    doc_number = getattr(quote, "invoice_number", None) or quote.quote_number

    pdf = QuotePDF(doc_type)
    pdf.add_page()

    # Doc meta
    pdf.section_header("Document Info")
    pdf.kv_row(doc_type + " NO.", _safe(doc_number))
    pdf.kv_row("DATE", datetime.now().strftime("%d %B %Y"))
    if doc_type == "QUOTATION":
        pdf.kv_row("VALID UNTIL", _safe(quote.valid_until or "-"))
    if getattr(quote, "created_by", None):
        pdf.kv_row("PREPARED BY", _safe(quote.created_by))
    pdf.ln(3)

    # Client info
    pdf.section_header("Bill To")
    pdf.kv_row("CLIENT", _safe(quote.client_name))
    pdf.kv_row("PHONE", _safe(quote.client_phone or "-"))
    if show_ic_address:
        pdf.kv_row("IC NUMBER", _safe(getattr(quote, "ic_number", None) or "-"))
        pdf.kv_row("CUSTOMER ADDRESS", _safe(getattr(quote, "customer_address", None) or "-"))
    pdf.kv_row("PROJECT ADDRESS", _safe(quote.project_address or "-"))
    pdf.kv_row("PROJECT TYPE", _safe((quote.project_type or "").capitalize()))
    if getattr(quote, "condo_name", None):
        pdf.kv_row("CONDO NAME", _safe(quote.condo_name))
    if getattr(quote, "size_range", None):
        pdf.kv_row("SIZE", _safe(quote.size_range))
    if getattr(quote, "design_theme", None):
        pdf.kv_row("DESIGN THEME", _safe(quote.design_theme))
    pdf.ln(3)

    # Items table — keep every named line (qty-0 rows included so "by others"/
    # provisional items still print); only drop truly blank placeholder rows.
    cats_used = {}
    for item in items:
        if not (item.description or "").strip():
            continue
        cats_used.setdefault(item.category, []).append(item)

    # Description ~70% of the table, the numeric columns share the remaining ~30%.
    if hide_unit_price:
        col_w = [133, 15, 18, 24]
        headers = ["Description", "UOM", "Qty", "Amount (RM)"]
    else:
        col_w = [133, 10, 12, 18, 17]
        headers = ["Description", "UOM", "Qty", "Unit (RM)", "Amount (RM)"]

    LINE_H, DET_LH = 4.0, 3.0
    x_left = pdf.l_margin
    table_w = sum(col_w)

    def column_header():
        pdf.set_fill_color(*HEADER_GRAY)
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "B", 7)
        for i, h in enumerate(headers):
            # Description stays left; everything under it aligns right.
            pdf.cell(col_w[i], 7, h, border=0, align="L" if i == 0 else "R",
                     fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.ln()
        pdf.set_text_color(0, 0, 0)

    def ensure_space(needed):
        # Manual page-break so composed rows never split across pages; re-print the
        # column header on the fresh page so columns stay labelled.
        if pdf.get_y() + needed > pdf.page_break_trigger:
            pdf.add_page()
            column_header()

    for cat_key, cat_items in cats_used.items():
        cat_label = _safe(CATEGORIES.get(cat_key, cat_key))
        ensure_space(20)
        pdf.category_header(cat_label)
        column_header()

        last_group = None
        for item in cat_items:
            grp = (getattr(item, "group_name", None) or "").strip()
            desc = _safe(item.description)
            det = _safe((getattr(item, "details", None) or "").strip())

            # Measure wrapped heights up front so the row never splits.
            pdf.set_font("Helvetica", "", 7)
            n_desc = max(1, len(pdf.multi_cell(col_w[0] - 3, LINE_H, desc, split_only=True)))
            det_lines = []
            if det:
                pdf.set_font("Helvetica", "I", 6.5)
                for para in det.split("\n"):
                    det_lines += (pdf.multi_cell(col_w[0] - 4, DET_LH, para, split_only=True) or [""])
            row_h = max(6.4, n_desc * LINE_H + (len(det_lines) * DET_LH + 1.0 if det_lines else 0) + 2.4)

            ensure_space((6 if grp and grp != last_group else 0) + row_h)
            if grp and grp != last_group:
                pdf.group_header(grp)
            last_group = grp

            x0, y0 = x_left, pdf.get_y()
            # Description (wraps) + detail sub-lines beneath it — same left edge as
            # the category/group labels so the layers stack cleanly (no staircase).
            pdf.set_xy(x0 + 2.5, y0 + 1.3)
            pdf.set_font("Helvetica", "", 7)
            pdf.multi_cell(col_w[0] - 3, LINE_H, desc, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
            if det_lines:
                pdf.set_x(x0 + 2.5)
                pdf.set_font("Helvetica", "I", 6.5)
                pdf.set_text_color(*GRAY)
                pdf.multi_cell(col_w[0] - 4, DET_LH, det, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
                pdf.set_text_color(0, 0, 0)
            # Numeric columns, top-aligned to the first description line
            pdf.set_font("Helvetica", "", 8)
            xc = x0 + col_w[0]
            pdf.set_xy(xc, y0 + 1.3); pdf.cell(col_w[1], LINE_H, _safe(item.uom or ""), align="R"); xc += col_w[1]
            pdf.set_xy(xc, y0 + 1.3); pdf.cell(col_w[2], LINE_H, f"{item.qty or 0:g}", align="R"); xc += col_w[2]
            if not hide_unit_price:
                pdf.set_xy(xc, y0 + 1.3); pdf.cell(col_w[3], LINE_H, f"{item.unit_price or 0:,.2f}", align="R"); xc += col_w[3]
            pdf.set_xy(xc, y0 + 1.3); pdf.cell(col_w[-1], LINE_H, f"{item.subtotal or 0:,.2f}", align="R")
            # Hairline separator, then advance to the next row
            pdf.set_draw_color(*ROW_BORDER)
            pdf.line(x0, y0 + row_h, x0 + table_w, y0 + row_h)
            pdf.set_xy(x0, y0 + row_h)

        # Category subtotal
        cat_sub = sum(i.subtotal or 0 for i in cat_items)
        ensure_space(6)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(*LIGHT_BEIGE)
        pdf.set_text_color(*TAUPE)
        pdf.cell(sum(col_w[:-1]), 6, f"  {cat_label} Subtotal", fill=True,
                 new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col_w[-1], 6, f"RM {cat_sub:,.2f}", align="R", fill=True,
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(3)

    # Totals block
    pdf.ln(2)
    x = 130
    def total_row(label, value, bold=False):
        pdf.set_x(x)
        pdf.set_font("Helvetica", "B" if bold else "", 9)
        pdf.cell(40, 7, label, new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.set_font("Helvetica", "B" if bold else "", 9)
        pdf.cell(36, 7, f"RM {value:,.2f}", align="R",
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    total_row("Subtotal:", quote.subtotal)
    total_row(f"SST ({int(quote.sst_rate*100)}%):", quote.sst_amount)

    pdf.set_x(x)
    pdf.set_fill_color(*NAVY)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(40, 9, "  TOTAL AMOUNT", fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(36, 9, f"RM {quote.total:,.2f}", align="R", fill=True,
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(0, 0, 0)

    # Terms
    if quote.terms_notes:
        pdf.ln(6)
        pdf.section_header("Terms & Notes")
        pdf.set_font("Helvetica", "", 8)
        pdf.multi_cell(0, 5, _safe(quote.terms_notes),
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    return bytes(pdf.output())
