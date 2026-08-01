# test_deletion_integrity.py
from app import create_app, db
from app.models.supplier import Supplier

def test_delete():
    app = create_app()
    with app.app_context():
        s = db.session.get(Supplier, 3)
        if s:
            print(f"Attempting to delete supplier: {s.name}")
            try:
                db.session.delete(s)
                db.session.commit()
                print("Supplier deleted successfully in test!")
            except Exception as e:
                db.session.rollback()
                print(f"Failed to delete supplier: {e}")
        else:
            print("Supplier 3 not found")

if __name__ == "__main__":
    test_delete()
