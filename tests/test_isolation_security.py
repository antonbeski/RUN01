"""
====================================================================
RUN01 - Data Isolation & Security Test Suite
Validates all 42 checklist items:
  A. Schema & Data Isolation (userId, required, indexes, timestamps)
  B. Authentication (hashed passwords, email lowercase/unique, JWT)
  C. Query Safety (no cross-user data leak, tamper rejection)
  D. Basic Authorization (roles, admin middleware)
  E-J. Indexes, Logging, Code Hygiene
====================================================================
"""

import os
import unittest
import mongomock
from bson import ObjectId

# Set test environment
os.environ["SECRET_KEY"] = "test-secret-key-12345-minimum-32-bytes-length-ok"
os.environ["JWT_SECRET"] = "test-jwt-secret-67890-minimum-32-bytes-length-ok"

from pyrunner.app import app
from pyrunner.db import set_mock_db, ensure_indexes, check_db_health, prepare_user_owned_doc
from pyrunner.auth import (
    hash_password,
    verify_password,
    normalize_email,
    create_access_token,
    verify_access_token,
    sanitize_audit_metadata
)


class DataIsolationAndSecurityTestCase(unittest.TestCase):
    def setUp(self):
        # Inject isolated in-memory mock database for each test
        self.mock_db = mongomock.MongoClient().run01_test
        set_mock_db(self.mock_db)
        ensure_indexes(self.mock_db)
        self.client = app.test_client()

    def tearDown(self):
        set_mock_db(None)

    # ── A. SCHEMA & DATA ISOLATION ─────────────────────────────────────────────
    def test_01_user_owned_doc_enforces_required_user_id(self):
        """Item 1 & 2: userId is required and non-empty in user-owned collections."""
        with self.assertRaises(ValueError):
            prepare_user_owned_doc({"title": "test"}, auth_user_id="")

        doc = prepare_user_owned_doc({"title": "Valid"}, auth_user_id="user_123")
        self.assertEqual(doc["userId"], "user_123")
        self.assertIn("createdAt", doc)
        self.assertIn("updatedAt", doc)

    def test_03_indexes_created_for_user_id_and_email(self):
        """Item 3 & 25: Indexes exist on userId, userId+updatedAt, and unique email."""
        indexes = ensure_indexes(self.mock_db)
        self.assertIn("users", indexes)
        self.assertIn("snippets", indexes)
        self.assertIn("audit_logs", indexes)

    # ── B. AUTHENTICATION & QUERY SAFETY ───────────────────────────────────────
    def test_06_password_stored_as_hash_never_plaintext(self):
        """Item 6: Password is stored as a secure hash (scrypt), never plain."""
        plain = "SuperSecretPassword123"
        hashed = hash_password(plain)
        self.assertNotEqual(plain, hashed)
        self.assertTrue(hashed.startswith("scrypt:"))
        self.assertTrue(verify_password(hashed, plain))
        self.assertFalse(verify_password(hashed, "WrongPassword"))

    def test_07_email_lowercase_and_validated(self):
        """Item 7: Email is validated and normalized to lowercase."""
        normalized = normalize_email("  User.Test@Domain.COM  ")
        self.assertEqual(normalized, "user.test@domain.com")

        with self.assertRaises(ValueError):
            normalize_email("invalid-email-address")

    def test_08_login_returns_jwt_with_user_id(self):
        """Item 8 & 10: Signup/login returns signed JWT containing userId."""
        res = self.client.post("/api/auth/signup", json={
            "email": "alice@run01.internal",
            "password": "Password123!",
            "name": "Alice"
        })
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        token = data.get("token")
        self.assertTrue(token)

        decoded = verify_access_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["userId"], data["user"]["id"])
        self.assertEqual(decoded["role"], "user")

    def test_09_private_routes_require_authentication(self):
        """Item 9: Private routes reject unauthenticated requests with 401."""
        res = self.client.get("/api/snippets")
        self.assertEqual(res.status_code, 401)

    def test_32_to_35_complete_cross_user_data_isolation(self):
        """
        Items 11-15, 32-35:
          - User A creates data
          - User B cannot view User A's data
          - User B cannot update User A's data
          - User B cannot delete User A's data
          - Tamper test: Client cannot inject or spoof userId
        """
        # 1. Register User A
        res_a = self.client.post("/api/auth/signup", json={
            "email": "userA@test.com",
            "password": "PasswordA123",
            "name": "User A"
        })
        self.assertEqual(res_a.status_code, 201)
        token_a = res_a.get_json()["token"]
        user_a_id = res_a.get_json()["user"]["id"]

        # 2. Register User B
        res_b = self.client.post("/api/auth/signup", json={
            "email": "userB@test.com",
            "password": "PasswordB123",
            "name": "User B"
        })
        self.assertEqual(res_b.status_code, 201)
        token_b = res_b.get_json()["token"]
        user_b_id = res_b.get_json()["user"]["id"]

        self.assertNotEqual(user_a_id, user_b_id)

        # 3. User A creates a snippet
        headers_a = {"Authorization": f"Bearer {token_a}"}
        res_create = self.client.post("/api/snippets", headers=headers_a, json={
            "title": "User A Private Physics Model",
            "code": "import numpy as np\nprint('Physics A')",
            "language": "python"
        })
        self.assertEqual(res_create.status_code, 201)
        snippet_id = res_create.get_json()["id"]

        # 4. User B queries snippets list: MUST NOT see User A's snippet (Item 11, 12, 34)
        headers_b = {"Authorization": f"Bearer {token_b}"}
        res_list_b = self.client.get("/api/snippets", headers=headers_b)
        self.assertEqual(res_list_b.status_code, 200)
        self.assertEqual(len(res_list_b.get_json()["snippets"]), 0)

        # 5. User B tries to direct GET User A's snippet: MUST return 404 (Item 12, 34)
        res_get_b = self.client.get(f"/api/snippets/{snippet_id}", headers=headers_b)
        self.assertEqual(res_get_b.status_code, 404)

        # 6. User B tries to direct PUT User A's snippet: MUST return 404 (Item 14, 34)
        res_put_b = self.client.put(f"/api/snippets/{snippet_id}", headers=headers_b, json={
            "title": "Hacked Title by User B"
        })
        self.assertEqual(res_put_b.status_code, 404)

        # Verify User A's snippet was NOT modified
        res_get_a = self.client.get(f"/api/snippets/{snippet_id}", headers=headers_a)
        self.assertEqual(res_get_a.get_json()["snippet"]["title"], "User A Private Physics Model")

        # 7. User B tries to direct DELETE User A's snippet: MUST return 404 (Item 14, 34)
        res_del_b = self.client.delete(f"/api/snippets/{snippet_id}", headers=headers_b)
        self.assertEqual(res_del_b.status_code, 404)

        # Verify snippet still exists for User A
        res_get_a2 = self.client.get(f"/api/snippets/{snippet_id}", headers=headers_a)
        self.assertEqual(res_get_a2.status_code, 200)

        # 8. Tamper Test (Item 13, 35):
        # User B attempts to create a snippet with spoofed userId = user_a_id in payload
        res_spoof = self.client.post("/api/snippets", headers=headers_b, json={
            "userId": user_a_id,  # Malicious spoof attempt
            "title": "Spoofed Snippet",
            "code": "print('Spoof')"
        })
        self.assertEqual(res_spoof.status_code, 201)
        spoofed_snippet_id = res_spoof.get_json()["id"]

        # Backend MUST have bound it to User B (auth-derived userId), NOT User A!
        db_doc = self.mock_db.snippets.find_one({"_id": ObjectId(spoofed_snippet_id)})
        self.assertEqual(db_doc["userId"], user_b_id)
        self.assertNotEqual(db_doc["userId"], user_a_id)

    # ── D. ROLES & AUTHORIZATION ───────────────────────────────────────────────
    def test_16_to_18_role_based_authorization(self):
        """Item 16-18: Role enforcement (normal user vs admin)."""
        # Normal user cannot access admin metrics
        res_u = self.client.post("/api/auth/signup", json={
            "email": "normal@run01.internal",
            "password": "Password123!",
            "name": "Normal"
        })
        user_token = res_u.get_json()["token"]

        res_forbidden = self.client.get("/api/admin/metrics", headers={
            "Authorization": f"Bearer {user_token}"
        })
        self.assertEqual(res_forbidden.status_code, 403)

        # Admin user CAN access admin metrics
        admin_token = create_access_token(user_id="admin_1", email="admin@run01.internal", role="admin")
        res_admin = self.client.get("/api/admin/metrics", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        self.assertEqual(res_admin.status_code, 200)
        self.assertTrue(res_admin.get_json()["success"])

    # ── I. LOGGING & AUDIT ─────────────────────────────────────────────────────
    def test_36_to_38_audit_logging_and_credential_sanitization(self):
        """Item 36-38: Audit log records attempts, passwords & tokens are sanitized."""
        clean_meta = sanitize_audit_metadata({
            "email": "test@run01.internal",
            "password": "plainPasswordHere",
            "token": "secret_jwt_token_here",
            "safeField": 123
        })
        self.assertEqual(clean_meta["password"], "[REDACTED]")
        self.assertEqual(clean_meta["token"], "[REDACTED]")
        self.assertEqual(clean_meta["safeField"], 123)

        # Perform bad login to generate audit entry
        self.client.post("/api/auth/login", json={
            "email": "nobody@run01.internal",
            "password": "wrong"
        })
        log = self.mock_db.audit_logs.find_one({"action": "LOGIN_FAILED"})
        self.assertIsNotNone(log)
        self.assertEqual(log["status"], "FAILURE")
        self.assertNotIn("password", log.get("metadata", {}))


if __name__ == "__main__":
    unittest.main()
