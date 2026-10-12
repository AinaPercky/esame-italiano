"""
Client API HTTP pour le frontend Streamlit
Communique avec le backend Node.js Express
"""

import os
import requests

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api")

class ApiClient:
    def __init__(self, base_url=None):
        self.base_url = base_url or API_BASE_URL
        self.headers = {"Content-Type": "application/json"}

    # Classes
    def get_classes(self):
        try:
            res = requests.get(f"{self.base_url}/classes", headers=self.headers, timeout=5)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def create_class(self, name):
        res = requests.post(f"{self.base_url}/classes", json={"name": name}, headers=self.headers)
        return res.json()

    def delete_class(self, class_id):
        res = requests.delete(f"{self.base_url}/classes/{class_id}", headers=self.headers)
        return res.json()

    # Students
    def get_students(self, class_id=None, search=None):
        params = {}
        if class_id:
            params["class_id"] = class_id
        if search:
            params["search"] = search
        try:
            res = requests.get(f"{self.base_url}/students", params=params, headers=self.headers, timeout=5)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def create_student(self, first_name, last_name, class_id, student_number=None):
        payload = {
            "first_name": first_name,
            "last_name": last_name,
            "class_id": class_id,
            "student_number": student_number
        }
        res = requests.post(f"{self.base_url}/students", json=payload, headers=self.headers)
        return res.json()

    def import_students(self, students_list, default_class_id=None):
        payload = {
            "students": students_list,
            "default_class_id": default_class_id
        }
        res = requests.post(f"{self.base_url}/students/import", json=payload, headers=self.headers)
        return res.json()

    # Exams
    def get_exams(self, class_id=None):
        params = {"class_id": class_id} if class_id else {}
        try:
            res = requests.get(f"{self.base_url}/exams", params=params, headers=self.headers, timeout=5)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def get_exam_by_id(self, exam_id):
        try:
            res = requests.get(f"{self.base_url}/exams/{exam_id}", headers=self.headers, timeout=5)
            return res.json() if res.status_code == 200 else None
        except Exception:
            return None

    def create_exam(self, title, class_id, description="", exam_date=None, use_zebu_template=True):
        payload = {
            "title": title,
            "class_id": class_id,
            "description": description,
            "exam_date": exam_date,
            "use_zebu_template": use_zebu_template
        }
        res = requests.post(f"{self.base_url}/exams", json=payload, headers=self.headers)
        return res.json()

    # Evaluations
    def get_evaluations(self, exam_id=None, class_id=None):
        params = {}
        if exam_id:
            params["exam_id"] = exam_id
        if class_id:
            params["class_id"] = class_id
        try:
            res = requests.get(f"{self.base_url}/evaluations", params=params, headers=self.headers, timeout=5)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def save_evaluation(self, exam_id, student_id, rubrics_validated):
        payload = {
            "exam_id": exam_id,
            "student_id": student_id,
            "rubrics_validated": rubrics_validated,
            "status": "completed"
        }
        res = requests.post(f"{self.base_url}/evaluations", json=payload, headers=self.headers)
        return res.json()

    # Pass Order
    def get_pass_order(self, exam_id):
        try:
            res = requests.get(f"{self.base_url}/exams/{exam_id}/pass-order", headers=self.headers, timeout=5)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def randomize_pass_order(self, exam_id):
        res = requests.post(f"{self.base_url}/exams/{exam_id}/pass-order/randomize", headers=self.headers)
        return res.json()

    def update_pass_status(self, exam_id, student_id, status):
        res = requests.put(f"{self.base_url}/exams/{exam_id}/pass-order", json={"student_id": student_id, "status": status}, headers=self.headers)
        return res.json()

    # Statistics
    def get_exam_statistics(self, exam_id):
        try:
            res = requests.get(f"{self.base_url}/exams/{exam_id}/statistics", headers=self.headers, timeout=5)
            return res.json() if res.status_code == 200 else None
        except Exception:
            return None

api = ApiClient()
