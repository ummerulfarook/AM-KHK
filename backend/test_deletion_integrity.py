# test_deletion_integrity.py
from app import create_app, db
from app.models.customer import Customer

def test_delete():
    app = create_app()
    with app.app_context():
        c = db.session.get(Customer, 9)
        if c:
            print(f"Attempting to delete customer: {c.name}")
            try:
                db.session.delete(c)
                db.session.commit()
                print("Customer deleted successfully in test!")
            except Exception as e:
                db.session.rollback()
                print(f"Failed to delete customer: {e}")
        else:
            print("Customer 9 not found")

if __name__ == "__main__":
    test_delete()
