"""
Production entry-point using Waitress WSGI server.
Run: python waitress_serve.py

The server binds on all interfaces at port 8000 so LAN clients
can reach it at http://<server-ip>:8000
"""
import sys
import os

# Add the backend directory to the path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, os.path.abspath(backend_dir))

from waitress import serve
from app import create_app

app = create_app()

if __name__ == "__main__":
    print("Starting AM & KHK ERP on http://0.0.0.0:8000")
    serve(app, host="0.0.0.0", port=8000, threads=4)
