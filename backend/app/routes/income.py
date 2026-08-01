"""Income blueprint — full implementation in Milestone 6."""
from flask import Blueprint, jsonify
from flask_login import login_required

income_bp = Blueprint("income", __name__, url_prefix="/api/income")


@income_bp.route("/", methods=["GET"])
@login_required
def list_income():
    return jsonify({"data": [], "message": "Income — coming in Milestone 6"}), 200
