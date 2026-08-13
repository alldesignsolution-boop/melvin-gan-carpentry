from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from auth import authenticate_user, make_token, get_current_user

router = APIRouter(tags=["auth"])


@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    error = request.query_params.get("error", "")
    error_html = f'<p style="color:#ef4444;margin-top:12px;font-size:13px">{error}</p>' if error else ""
    return HTMLResponse(f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Melvin Gan Carpentry — Login</title>
<style>
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f5f6fa;
          display:flex; align-items:center; justify-content:center; min-height:100vh; }}
  .card {{ background:white; border-radius:16px; padding:40px; width:360px;
           box-shadow:0 4px 24px rgba(0,0,0,.08); }}
  h1 {{ font-size:22px; font-weight:700; margin-bottom:8px; }}
  .sub {{ color:#888; font-size:13px; margin-bottom:28px; }}
  label {{ display:block; font-size:12px; color:#666; font-weight:600;
           text-transform:uppercase; letter-spacing:.4px; margin-bottom:4px; }}
  input {{ width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px;
           font-size:14px; margin-bottom:16px; }}
  button {{ width:100%; background:#4a3b30; color:white; border:none; padding:12px;
            border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; margin-top:4px; }}
  button:hover {{ background:#33291f; }}
</style></head>
<body>
<div class="card">
  <h1>🏠 Melvin Gan Carpentry</h1>
  <p class="sub">Internal business system</p>
  <form method="POST" action="/login">
    <label>Username</label>
    <input name="username" type="text" autocomplete="username" autofocus required>
    <label>Password</label>
    <input name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign In</button>
  </form>
  {error_html}
</div>
</body></html>""")


@router.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    username = str(form.get("username", "")).strip()
    password = str(form.get("password", ""))

    user = authenticate_user(username, password, db)
    if not user:
        return RedirectResponse("/login?error=Invalid+username+or+password", status_code=302)

    token = make_token(user.username, user.role)
    resp = RedirectResponse("/", status_code=302)
    resp.set_cookie("melvin_session", token, httponly=True, max_age=43200)
    return resp


@router.post("/logout")
def logout():
    resp = RedirectResponse("/login", status_code=302)
    resp.delete_cookie("melvin_session")
    return resp


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user
