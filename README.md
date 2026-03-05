# AMER Leadership Dashboard

Sales leadership dashboard for AMER teams (Zulu, Foxtrot, Alpha).

## Stack
- **Data**: Salesforce via `sf` CLI
- **Storage**: SQLite
- **Frontend**: Static HTML/JS + Chart.js
- **Refresh**: Daily cron

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Initial data pull
python src/fetch_sfdc.py

# Start server
python -m http.server 8080 --directory static
```

## Data Refresh

Add to crontab for daily refresh:
```
0 6 * * * cd /path/to/amer-leadership-dashboard && python src/fetch_sfdc.py
```

## Sections
1. Priority Queues (P1-P4)
2. Pipeline Summary
3. Rep Scoreboard
4. Deal List
