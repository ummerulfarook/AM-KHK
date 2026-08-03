# date_helper.py
from datetime import datetime, timezone

def get_working_date() -> datetime:
    """Return the timezone-aware working datetime based on X-Working-Date header."""
    from flask import request
    try:
        hdr = request.headers.get("X-Working-Date")
        if hdr:
            # Parse 'YYYY-MM-DD'
            parsed = datetime.strptime(hdr.strip(), "%Y-%m-%d")
            now = datetime.now(timezone.utc)
            # Combine the custom date with the current UTC time
            return datetime.combine(parsed.date(), now.time()).replace(tzinfo=timezone.utc)
    except Exception:
        pass
    return datetime.now(timezone.utc)
