#!/usr/bin/env python3
"""
Fetch Salesforce data for AMER Leadership Dashboard.
Pulls opportunities for Zulu, Foxtrot, Alpha teams.
"""

import subprocess
import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "dashboard.db"
STATIC_DIR = BASE_DIR / "static"

# SFDC Config - use default authenticated org
SF_ORG = None  # Will use default org
AMER_TEAMS = ["Zulu", "Foxtrot", "Alpha"]


def run_soql(query: str) -> list:
    """Execute SOQL query via sf CLI."""
    cmd = ["sf", "data", "query", "-q", query, "--json"]
    if SF_ORG:
        cmd.extend(["-o", SF_ORG])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"SOQL Error: {result.stderr}")
        return []
    try:
        data = json.loads(result.stdout)
        return data.get("result", {}).get("records", [])
    except json.JSONDecodeError:
        print(f"JSON Error: {result.stdout[:500]}")
        return []


def init_db():
    """Initialize SQLite database."""
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS opportunities (
            id TEXT PRIMARY KEY,
            name TEXT,
            owner_name TEXT,
            owner_role TEXT,
            team TEXT,
            stage TEXT,
            stage_number INTEGER,
            amount REAL,
            close_date TEXT,
            created_date TEXT,
            probability INTEGER,
            meddic_score REAL,
            has_champion INTEGER,
            has_economic_buyer INTEGER,
            has_decision_criteria INTEGER,
            has_decision_process INTEGER,
            has_identify_pain INTEGER,
            is_closed INTEGER,
            is_won INTEGER,
            last_updated TEXT,
            next_step TEXT,
            last_activity_date TEXT,
            firmo_score REAL
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_time TEXT,
            records_synced INTEGER
        )
    """)
    
    conn.commit()
    return conn


def extract_team(owner_role: str) -> str:
    """Extract team name from Owner_Role__c."""
    if not owner_role:
        return "Unknown"
    for team in AMER_TEAMS:
        if team in owner_role:
            return team
    return "Other"


def calculate_meddic_score(opp: dict) -> float:
    """Calculate MEDDIC score (0-100) based on fields."""
    # Using available fields - Champion_Identified__c exists
    # Score based on: champion, stage progression, probability
    score = 0
    
    # Champion identified = 30 points
    if opp.get("Champion_Identified__c"):
        score += 30
    
    # Stage progression (higher stage = more qualified)
    stage_scores = {
        "AE Qualification": 10,
        "Discovery": 20,
        "Proposal": 30,
        "Testing/Negotiation": 35,
        "Customer Ramp Up": 40,
    }
    score += stage_scores.get(opp.get("StageName", ""), 10)
    
    # Probability contributes up to 30 points
    prob = opp.get("Probability") or 0
    score += (prob / 100) * 30
    
    return min(score, 100)


def fetch_opportunities():
    """Fetch open opportunities for AMER teams."""
    # Build team filter
    team_filter = " OR ".join([f"Owner_Role__c LIKE '%{t}%'" for t in AMER_TEAMS])
    
    query = f"""
        SELECT Id, Name, Owner.Name, Owner_Role__c, StageName, Amount,
               CloseDate, CreatedDate, Probability, IsClosed, IsWon,
               Champion_Identified__c, NextStep, LastActivityDate,
               Account.firmoScoreTotalFormula__c
        FROM Opportunity
        WHERE ({team_filter})
        AND (IsClosed = false OR CloseDate >= LAST_N_DAYS:90)
        ORDER BY CloseDate ASC
    """
    
    return run_soql(query)


def stage_to_number(stage: str) -> int:
    """Convert stage name to number."""
    stages = {
        "AE Qualification": 0,
        "Discovery": 1,
        "Proposal": 2,
        "Testing/Negotiation": 3,
        "Customer Ramp Up": 4,
        "Closed Won": 5,
        "Closed Lost": -1,
    }
    return stages.get(stage, 0)


def sync_opportunities(conn):
    """Sync opportunities to SQLite."""
    opps = fetch_opportunities()
    c = conn.cursor()
    
    now = datetime.now().isoformat()
    synced = 0
    
    for opp in opps:
        owner = opp.get("Owner", {}) or {}
        team = extract_team(opp.get("Owner_Role__c"))
        meddic = calculate_meddic_score(opp)
        
        # Extract firmo score from Account
        account = opp.get("Account") or {}
        firmo = account.get("firmoScoreTotalFormula__c") or 0
        
        c.execute("""
            INSERT OR REPLACE INTO opportunities VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """, (
            opp.get("Id"),
            opp.get("Name"),
            owner.get("Name"),
            opp.get("Owner_Role__c"),
            team,
            opp.get("StageName"),
            stage_to_number(opp.get("StageName", "")),
            opp.get("Amount") or 0,
            opp.get("CloseDate"),
            opp.get("CreatedDate"),
            opp.get("Probability") or 0,
            meddic,
            1 if opp.get("Champion_Identified__c") else 0,
            0,  # economic_buyer - field not available
            0,  # decision_criteria - field not available
            0,  # decision_process - field not available
            0,  # identify_pain - field not available
            1 if opp.get("IsClosed") else 0,
            1 if opp.get("IsWon") else 0,
            now,
            opp.get("NextStep"),
            opp.get("LastActivityDate"),
            firmo,
        ))
        synced += 1
    
    # Log sync
    c.execute("INSERT INTO sync_log (sync_time, records_synced) VALUES (?, ?)",
              (now, synced))
    
    conn.commit()
    print(f"Synced {synced} opportunities at {now}")
    return synced


def generate_dashboard_data(conn):
    """Generate JSON data for dashboard."""
    c = conn.cursor()
    
    # Get current date info
    today = datetime.now().date()
    this_week_end = today + timedelta(days=(6 - today.weekday()))
    month_end = (today.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    quarter_month = ((today.month - 1) // 3 + 1) * 3
    quarter_end = today.replace(month=quarter_month, day=1) + timedelta(days=32)
    quarter_end = quarter_end.replace(day=1) - timedelta(days=1)
    
    # Priority queues
    c.execute("""
        SELECT * FROM opportunities 
        WHERE is_closed = 0 AND close_date <= ? 
        ORDER BY close_date
    """, (this_week_end.isoformat(),))
    p1_deals = c.fetchall()
    
    c.execute("""
        SELECT * FROM opportunities 
        WHERE is_closed = 0 AND close_date > ? AND close_date <= ?
        ORDER BY close_date
    """, (this_week_end.isoformat(), month_end.isoformat()))
    p2_deals = c.fetchall()
    
    c.execute("""
        SELECT * FROM opportunities 
        WHERE is_closed = 0 AND close_date > ? AND close_date <= ?
        ORDER BY close_date
    """, (month_end.isoformat(), quarter_end.isoformat()))
    p3_deals = c.fetchall()
    
    c.execute("""
        SELECT * FROM opportunities 
        WHERE is_closed = 0 AND close_date > ?
        ORDER BY close_date
    """, (quarter_end.isoformat(),))
    p4_deals = c.fetchall()
    
    # Pipeline summary
    c.execute("""
        SELECT COUNT(*), SUM(amount), AVG(meddic_score)
        FROM opportunities WHERE is_closed = 0
    """)
    pipeline = c.fetchone()
    
    c.execute("""
        SELECT COUNT(*) FROM opportunities 
        WHERE is_closed = 0 AND meddic_score <= 20
    """)
    critical = c.fetchone()[0]
    
    # Rep scoreboard
    c.execute("""
        SELECT owner_name, team,
               COUNT(*) as deals,
               AVG(meddic_score) as avg_meddic,
               SUM(amount) as pipeline,
               SUM(CASE WHEN meddic_score <= 40 THEN 1 ELSE 0 END) as low_meddic
        FROM opportunities
        WHERE is_closed = 0
        GROUP BY owner_name
        ORDER BY pipeline DESC
    """)
    rep_scores = c.fetchall()
    
    # Win rates (last 90 days)
    c.execute("""
        SELECT owner_name,
               SUM(CASE WHEN is_won = 1 THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN is_closed = 1 AND is_won = 0 THEN 1 ELSE 0 END) as losses,
               SUM(CASE WHEN is_won = 1 THEN amount ELSE 0 END) as won_amount
        FROM opportunities
        WHERE is_closed = 1
        GROUP BY owner_name
    """)
    win_rates = {row[0]: {"wins": row[1], "losses": row[2], "won": row[3]} for row in c.fetchall()}
    
    # Build rep data
    reps = []
    for row in rep_scores:
        owner = row[0]
        wr = win_rates.get(owner, {"wins": 0, "losses": 0, "won": 0})
        total = wr["wins"] + wr["losses"]
        reps.append({
            "name": owner,
            "team": row[1],
            "deals": row[2],
            "avg_meddic": round(row[3] or 0, 1),
            "pipeline": row[4] or 0,
            "low_meddic_count": row[5],
            "win_rate": round((wr["wins"] / total * 100) if total > 0 else 0, 1),
            "wins": wr["wins"],
            "losses": wr["losses"],
            "won_amount": wr["won"],
        })
    
    # Column names for deal list
    columns = [d[0] for d in c.description] if c.description else []
    
    # Build deal list helper
    def deals_to_list(rows):
        today = datetime.now()
        result = []
        for r in rows:
            created = r[9]
            age_days = 0
            if created:
                try:
                    created_dt = datetime.fromisoformat(created.replace('+0000', '+00:00').replace('Z', '+00:00'))
                    age_days = (today - created_dt.replace(tzinfo=None)).days
                except:
                    pass
            
            # Get firmo score and has_champion
            firmo = r[22] if len(r) > 22 else 0
            has_champ = bool(r[12])
            stage = r[5] or ""
            
            # Calculate composite ICP: firmo base + champion bonus + stage bonus
            icp = firmo or 0
            if has_champ:
                icp += 15  # Champion bonus
            if "Testing" in stage or "Negotiation" in stage:
                icp += 10  # Late stage bonus
            elif "Proposal" in stage:
                icp += 5   # Mid stage bonus
            icp = min(100, max(0, icp))  # Clamp 0-100
            
            result.append({
                "id": r[0],
                "name": r[1],
                "owner": r[2],
                "owner_role": r[3],
                "team": r[4],
                "stage": r[5],
                "amount": r[7],
                "close_date": r[8],
                "created_date": r[9],
                "age_days": age_days,
                "firmo_score": firmo or 0,
                "icp_score": round(icp, 0),
                "meddic_score": round(r[11] or 0, 1),
                "has_champion": has_champ,
                "next_step": r[20] if len(r) > 20 else None,
                "last_activity_date": r[21] if len(r) > 21 else None,
            })
        return result
    
    # Last sync
    c.execute("SELECT sync_time FROM sync_log ORDER BY id DESC LIMIT 1")
    last_sync = c.fetchone()
    
    data = {
        "generated_at": datetime.now().isoformat(),
        "last_sync": last_sync[0] if last_sync else None,
        "priority_queues": {
            "p1": {"label": "This Week", "count": len(p1_deals), "deals": deals_to_list(p1_deals)},
            "p2": {"label": "This Month", "count": len(p2_deals), "deals": deals_to_list(p2_deals)},
            "p3": {"label": "Quarter", "count": len(p3_deals), "deals": deals_to_list(p3_deals)},
            "p4": {"label": "Backlog", "count": len(p4_deals), "deals": deals_to_list(p4_deals)},
        },
        "pipeline": {
            "total_deals": pipeline[0] or 0,
            "total_amount": pipeline[1] or 0,
            "avg_meddic": round(pipeline[2] or 0, 1),
            "critical_count": critical,
        },
        "reps": reps,
    }
    
    # Write to static dir
    output_path = STATIC_DIR / "data.json"
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"Generated dashboard data: {output_path}")
    return data


def main():
    print("AMER Leadership Dashboard - Data Sync")
    print("=" * 40)
    
    conn = init_db()
    sync_opportunities(conn)
    generate_dashboard_data(conn)
    conn.close()
    
    print("Done!")


if __name__ == "__main__":
    main()
