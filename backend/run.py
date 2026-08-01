"""
Development entry-point.
Run with: python run.py
Or with Flask CLI: flask --app run run --debug
"""
import os
import sys

# Make sure the backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db

app = create_app()

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, host="0.0.0.0", port=5000)
