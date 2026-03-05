#!/usr/bin/env python3
"""
Simple API server for AMER Dashboard persistence.
Handles tasks CRUD and saves to JSON files.
"""

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from datetime import datetime
import urllib.parse

BASE_DIR = Path(__file__).parent.parent
STATIC_DIR = BASE_DIR / "static"
TASKS_FILE = STATIC_DIR / "tasks.json"

class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)
    
    def do_POST(self):
        if self.path == "/api/tasks":
            self.handle_save_tasks()
        else:
            self.send_error(404, "Not Found")
    
    def do_PUT(self):
        if self.path.startswith("/api/tasks/"):
            self.handle_update_task()
        else:
            self.send_error(404, "Not Found")
    
    def do_DELETE(self):
        if self.path.startswith("/api/tasks/"):
            self.handle_delete_task()
        else:
            self.send_error(404, "Not Found")
    
    def handle_save_tasks(self):
        """Save all tasks"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            with open(TASKS_FILE, 'w') as f:
                json.dump(data, f, indent=2)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        except Exception as e:
            self.send_error(500, str(e))
    
    def handle_update_task(self):
        """Update a single task"""
        try:
            task_id = self.path.split("/")[-1]
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            updates = json.loads(body)
            
            # Load existing tasks
            tasks_data = {"tasks": []}
            if TASKS_FILE.exists():
                with open(TASKS_FILE) as f:
                    tasks_data = json.load(f)
            
            # Find and update task
            for task in tasks_data.get("tasks", []):
                if task.get("id") == task_id:
                    task.update(updates)
                    break
            
            # Save
            with open(TASKS_FILE, 'w') as f:
                json.dump(tasks_data, f, indent=2)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        except Exception as e:
            self.send_error(500, str(e))
    
    def handle_delete_task(self):
        """Delete a task"""
        try:
            task_id = self.path.split("/")[-1]
            
            # Load existing tasks
            tasks_data = {"tasks": []}
            if TASKS_FILE.exists():
                with open(TASKS_FILE) as f:
                    tasks_data = json.load(f)
            
            # Remove task
            tasks_data["tasks"] = [t for t in tasks_data.get("tasks", []) if t.get("id") != task_id]
            
            # Save
            with open(TASKS_FILE, 'w') as f:
                json.dump(tasks_data, f, indent=2)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        except Exception as e:
            self.send_error(500, str(e))
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


def run(port=8080):
    print(f"Starting AMER Dashboard server on port {port}")
    print(f"Serving files from: {STATIC_DIR}")
    print(f"Tasks file: {TASKS_FILE}")
    server = HTTPServer(('0.0.0.0', port), DashboardHandler)
    server.serve_forever()


if __name__ == "__main__":
    run()
