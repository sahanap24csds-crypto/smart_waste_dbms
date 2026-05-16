"""
Smart Waste Management System - Backend API
============================================
Flask + SQLite backend providing REST API for:
  - Dashboard statistics
  - Smart bin monitoring
  - Complaint management (submit + full history)
  - Truck tracking
  - Analytics data
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta
import random

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the frontend

DB_NAME = "waste_management.db"

# ─────────────────────────────────────────────
#  DATABASE SETUP
# ─────────────────────────────────────────────

def get_db():
    """Open a database connection with row_factory for dict-like access."""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row   # rows accessible as dicts
    return conn


def init_db():
    """
    Create tables if they don't exist and seed with realistic sample data.
    Called once at startup.
    """
    conn = get_db()
    cur = conn.cursor()

    # ── Bins table ──────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS bins (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        bin_code    TEXT UNIQUE,
        location    TEXT,
        area        TEXT,
        fill_level  INTEGER,
        status      TEXT,
        last_emptied TEXT,
        lat         REAL,
        lng         REAL
    )
    """)

    # ── Complaints table (with timestamp & status history) ───
    cur.execute("""
    CREATE TABLE IF NOT EXISTS complaints (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT,
        location    TEXT,
        description TEXT,
        category    TEXT DEFAULT 'General',
        status      TEXT DEFAULT 'Pending',
        created_at  TEXT DEFAULT (datetime('now','localtime')),
        resolved_at TEXT
    )
    """)

    # ── Trucks table ────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS trucks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        truck_code  TEXT UNIQUE,
        driver      TEXT,
        area        TEXT,
        status      TEXT,
        last_updated TEXT
    )
    """)

    # ── Waste collection history (for chart analytics) ───
    cur.execute("""
    CREATE TABLE IF NOT EXISTS collection_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT,
        area        TEXT,
        tons_collected REAL
    )
    """)

    # ─── Seed data only if tables are empty ────

    cur.execute("SELECT COUNT(*) FROM bins")
    if cur.fetchone()[0] == 0:
        bins = [
            ("BIN-001", "MG Road Junction",      "Central",      92, "Critical",  "2026-05-07", 12.9757, 77.6093),
            ("BIN-002", "Whitefield Bus Stand",   "East",         55, "Moderate",  "2026-05-08", 12.9698, 77.7499),
            ("BIN-003", "Indiranagar 100ft Rd",   "East",         18, "Normal",    "2026-05-09", 12.9784, 77.6408),
            ("BIN-004", "KR Puram Bridge",        "Northeast",    99, "Overflow",  "2026-05-06", 13.0093, 77.6947),
            ("BIN-005", "Electronic City Phase1", "South",        73, "Moderate",  "2026-05-08", 12.8392, 77.6773),
            ("BIN-006", "Koramangala 5th Block",  "South",        30, "Normal",    "2026-05-09", 12.9344, 77.6269),
            ("BIN-007", "HSR Layout Sector 4",    "South",        85, "Critical",  "2026-05-07", 12.9116, 77.6389),
            ("BIN-008", "Jayanagar 4th Block",    "South",        45, "Normal",    "2026-05-08", 12.9308, 77.5826),
            ("BIN-009", "Hebbal Flyover",         "North",        95, "Critical",  "2026-05-06", 13.0352, 77.5970),
            ("BIN-010", "Rajajinagar Main",       "West",         60, "Moderate",  "2026-05-08", 12.9913, 77.5528),
            ("BIN-011", "Yeshwanthpur Circle",    "West",         22, "Normal",    "2026-05-09", 13.0245, 77.5490),
            ("BIN-012", "BTM Layout 2nd Stage",   "South",        88, "Critical",  "2026-05-07", 12.9165, 77.6101),
        ]
        cur.executemany(
            "INSERT INTO bins(bin_code,location,area,fill_level,status,last_emptied,lat,lng) VALUES(?,?,?,?,?,?,?,?)",
            bins
        )

    cur.execute("SELECT COUNT(*) FROM trucks")
    if cur.fetchone()[0] == 0:
        trucks = [
            ("TRK-A1", "Ramesh Kumar",  "Central",   "On Route",    "2026-05-09 08:30"),
            ("TRK-A2", "Suresh Babu",   "East",      "Collecting",  "2026-05-09 09:15"),
            ("TRK-A3", "Mahesh Reddy",  "South",     "Idle",        "2026-05-09 07:00"),
            ("TRK-A4", "Dinesh Naik",   "North",     "On Route",    "2026-05-09 09:45"),
            ("TRK-A5", "Prakash Singh", "West",      "Collecting",  "2026-05-09 08:00"),
            ("TRK-A6", "Venkat Rao",    "Northeast", "Maintenance", "2026-05-08 18:00"),
            ("TRK-A7", "Anil Kumar",    "South",     "On Route",    "2026-05-09 09:00"),
        ]
        cur.executemany(
            "INSERT INTO trucks(truck_code,driver,area,status,last_updated) VALUES(?,?,?,?,?)",
            trucks
        )

    cur.execute("SELECT COUNT(*) FROM complaints")
    if cur.fetchone()[0] == 0:
        # Realistic sample complaint history
        sample_complaints = [
            ("Priya Sharma",    "Whitefield",       "Bin overflowing for 3 days, causing foul smell near school gate.",         "Overflow",   "Resolved",  "2026-04-28 10:20", "2026-04-30 15:00"),
            ("Arjun Nair",      "Koramangala",      "Garbage not collected since last week. Stray dogs scattering waste.",        "Missed Pickup","Resolved", "2026-05-01 09:05", "2026-05-03 11:30"),
            ("Meena Iyer",      "Indiranagar",      "Broken bin lid; waste exposed to rain and insects.",                        "Damage",     "In Progress","2026-05-03 14:45", None),
            ("Sanjay Verma",    "HSR Layout",       "Bin on 27th cross hasn't been emptied in 5 days. Overflow on footpath.",    "Overflow",   "Resolved",  "2026-05-04 08:00", "2026-05-06 09:20"),
            ("Lakshmi Prasad",  "BTM Layout",       "Foul odour from nearby bin. Residents unable to open windows.",             "Odour",      "Pending",   "2026-05-06 16:30", None),
            ("Kiran Bhat",      "Hebbal",           "Truck collection timings need to be changed to early morning.",             "Schedule",   "Pending",   "2026-05-07 07:15", None),
            ("Deepa Reddy",     "Electronic City",  "Biodegradable and non-biodegradable waste mixed by collection staff.",      "Segregation","In Progress","2026-05-07 11:00", None),
            ("Ravi Krishnan",   "MG Road",          "Bin near metro station overflowing during peak hours daily.",               "Overflow",   "Pending",   "2026-05-08 18:45", None),
            ("Anita Kulkarni",  "Jayanagar",        "Bin damaged; sharp edges are a hazard to children and elderly.",            "Damage",     "Pending",   "2026-05-09 06:50", None),
            ("Suresh Gowda",    "Rajajinagar",      "Collection truck didn't come yesterday. Bins are nearly full.",             "Missed Pickup","In Progress","2026-05-09 07:30", None),
        ]
        cur.executemany(
            "INSERT INTO complaints(name,location,description,category,status,created_at,resolved_at) VALUES(?,?,?,?,?,?,?)",
            sample_complaints
        )

    cur.execute("SELECT COUNT(*) FROM collection_history")
    if cur.fetchone()[0] == 0:
        # 7 days of collection data per area
        areas = ["Central", "East", "South", "North", "West"]
        records = []
        for i in range(7):
            day = (datetime.now() - timedelta(days=6 - i)).strftime("%Y-%m-%d")
            day_label = (datetime.now() - timedelta(days=6 - i)).strftime("%a")
            for area in areas:
                tons = round(random.uniform(3.5, 12.0), 2)
                records.append((day_label, area, tons))
        cur.executemany(
            "INSERT INTO collection_history(date,area,tons_collected) VALUES(?,?,?)",
            records
        )

    conn.commit()
    conn.close()


# ─────────────────────────────────────────────
#  API ROUTES
# ─────────────────────────────────────────────

@app.route("/api/dashboard")
def dashboard():
    """
    GET /api/dashboard
    Returns summary statistics for the top KPI cards.
    """
    conn = get_db()
    cur = conn.cursor()

    total_bins   = cur.execute("SELECT COUNT(*) FROM bins").fetchone()[0]
    critical     = cur.execute("SELECT COUNT(*) FROM bins WHERE fill_level > 80").fetchone()[0]
    total_comp   = cur.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
    pending_comp = cur.execute("SELECT COUNT(*) FROM complaints WHERE status='Pending'").fetchone()[0]
    active_trucks= cur.execute("SELECT COUNT(*) FROM trucks WHERE status IN ('On Route','Collecting')").fetchone()[0]
    avg_fill     = cur.execute("SELECT ROUND(AVG(fill_level),1) FROM bins").fetchone()[0]

    conn.close()
    return jsonify({
        "total_bins":    total_bins,
        "critical_bins": critical,
        "total_complaints": total_comp,
        "pending_complaints": pending_comp,
        "active_trucks": active_trucks,
        "avg_fill_level": avg_fill
    })


@app.route("/api/bins")
def get_bins():
    """
    GET /api/bins
    Returns all smart bins with full details.
    """
    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM bins ORDER BY fill_level DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/bins/<int:bin_id>", methods=["PATCH"])
def update_bin(bin_id):
    """
    PATCH /api/bins/<id>
    Update a bin's fill level and status (called by IoT sensors in production).
    Body: { "fill_level": 75 }
    """
    data = request.json
    fill = data.get("fill_level", 0)

    # Auto-determine status based on fill level
    if fill >= 90:
        status = "Overflow"
    elif fill >= 80:
        status = "Critical"
    elif fill >= 50:
        status = "Moderate"
    else:
        status = "Normal"

    conn = get_db()
    conn.execute(
        "UPDATE bins SET fill_level=?, status=? WHERE id=?",
        (fill, status, bin_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Bin updated successfully", "status": status})


@app.route("/api/complaints", methods=["GET", "POST"])
def complaints():
    """
    GET  /api/complaints  → Full complaint history (newest first)
    POST /api/complaints  → Submit a new complaint
    Body: { name, location, description, category }
    """
    conn = get_db()
    cur = conn.cursor()

    if request.method == "POST":
        d = request.json
        cur.execute(
            "INSERT INTO complaints(name,location,description,category) VALUES(?,?,?,?)",
            (d.get("name"), d.get("location"), d.get("description"), d.get("category", "General"))
        )
        conn.commit()
        new_id = cur.lastrowid
        conn.close()
        return jsonify({"message": "Complaint submitted successfully!", "id": new_id}), 201

    # GET: return all complaints ordered by newest first
    rows = cur.execute(
        "SELECT * FROM complaints ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/complaints/<int:comp_id>/status", methods=["PATCH"])
def update_complaint_status(comp_id):
    """
    PATCH /api/complaints/<id>/status
    Update complaint status (Pending → In Progress → Resolved).
    Body: { "status": "Resolved" }
    """
    data   = request.json
    status = data.get("status")
    resolved_at = None
    if status == "Resolved":
        resolved_at = datetime.now().strftime("%Y-%m-%d %H:%M")

    conn = get_db()
    conn.execute(
        "UPDATE complaints SET status=?, resolved_at=? WHERE id=?",
        (status, resolved_at, comp_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": f"Status updated to {status}"})


@app.route("/api/trucks")
def get_trucks():
    """
    GET /api/trucks
    Returns all truck records with driver and area info.
    """
    conn = get_db()
    rows = conn.execute("SELECT * FROM trucks").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/analytics")
def analytics():
    """
    GET /api/analytics
    Returns:
      - weekly_collection: daily totals for the line chart
      - fill_distribution: count of bins by status category
      - area_stats: per-area average fill level
    """
    conn = get_db()
    cur  = conn.cursor()

    # Weekly totals (sum across all areas per day label)
    weekly_raw = cur.execute(
        "SELECT date, ROUND(SUM(tons_collected),2) FROM collection_history GROUP BY date"
    ).fetchall()
    weekly = {"labels": [r[0] for r in weekly_raw], "values": [r[1] for r in weekly_raw]}

    # Bin fill distribution counts
    dist = {
        "Normal":   cur.execute("SELECT COUNT(*) FROM bins WHERE fill_level < 50").fetchone()[0],
        "Moderate": cur.execute("SELECT COUNT(*) FROM bins WHERE fill_level BETWEEN 50 AND 79").fetchone()[0],
        "Critical": cur.execute("SELECT COUNT(*) FROM bins WHERE fill_level BETWEEN 80 AND 89").fetchone()[0],
        "Overflow": cur.execute("SELECT COUNT(*) FROM bins WHERE fill_level >= 90").fetchone()[0],
    }

    # Per-area average fill
    area_raw = cur.execute(
        "SELECT area, ROUND(AVG(fill_level),1) FROM bins GROUP BY area"
    ).fetchall()
    area_stats = {"labels": [r[0] for r in area_raw], "values": [r[1] for r in area_raw]}

    conn.close()
    return jsonify({
        "weekly_collection": weekly,
        "fill_distribution": dist,
        "area_stats": area_stats
    })


# ─────────────────────────────────────────────
#  SERVER ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("🌱 Initialising Smart Waste Management database...")
    init_db()
    print("✅ Database ready.")
    print("🚀 Starting server on http://127.0.0.1:8000")
    app.run(debug=True, port=8000)
