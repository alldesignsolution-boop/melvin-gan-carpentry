from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = "sqlite:///./data/melvin.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import os, hashlib
    os.makedirs("data", exist_ok=True)
    from models import Lead, StatusLog, User, Quote, QuoteItem, Invoice, Counter, Product, QuotePackage, Checklist, ChecklistItem  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Seed products from materials.json if table is empty
    db2 = SessionLocal()
    try:
        if db2.query(Product).count() == 0:
            import json, pathlib
            mf = pathlib.Path(__file__).parent / "frontend" / "materials.json"
            if mf.exists():
                for item in json.loads(mf.read_text()):
                    db2.add(Product(
                        type=item.get("type", ""),
                        room=item.get("room", ""),
                        description=item.get("desc", ""),
                        uom=item.get("uom"),
                        price=float(item.get("price", 0)),
                    ))
                db2.commit()
    finally:
        db2.close()

    # Ensure admin user exists (create or update password)
    db = SessionLocal()
    try:
        admin_user = os.getenv("ADMIN_USER", "melvin")
        admin_pass = os.getenv("ADMIN_PASS", "hoga@2026")
        pw_hash = hashlib.sha256(admin_pass.encode()).hexdigest()
        user = db.query(User).filter(User.username == admin_user).first()
        if user:
            user.password_hash = pw_hash
            user.role = "admin"
        else:
            db.add(User(
                username=admin_user,
                password_hash=pw_hash,
                full_name="Admin",
                role="admin",
            ))
        db.commit()
    finally:
        db.close()
