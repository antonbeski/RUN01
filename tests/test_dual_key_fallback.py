import os
import unittest
from unittest.mock import patch, MagicMock
from pyrunner.app import app

class MockStreamingResponse:
    def __init__(self, status_code, chunks=None, error_json=None):
        self.status_code = status_code
        self._chunks = chunks or []
        self._error_json = error_json or {}
        self.text = str(error_json) if error_json else ""

    def json(self):
        return self._error_json

    def iter_content(self, chunk_size=512):
        for chunk in self._chunks:
            yield chunk


class TestDualKeyFallback(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        # Set both test keys
        self.patch_env = patch.dict(os.environ, {
            "GROQ_API_KEY": "gsk_primary_key_00000000001",
            "GROQ_API_KEY_2": "gsk_secondary_key_00000002",
        })
        self.patch_env.start()

    def tearDown(self):
        self.patch_env.stop()

    def test_keys_status_endpoint(self):
        resp = self.client.get("/api/ai/keys-status")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["provider"], "Groq")
        self.assertTrue(data["primary_key"]["configured"])
        self.assertTrue(data["secondary_key"]["configured"])
        self.assertTrue(data["dual_key_fallback_active"])

    @patch("pyrunner.app._call_chat_provider")
    def test_fallback_to_key2_when_key1_hits_rate_limit_429(self, mock_call):
        """When Key 1 returns HTTP 429 (Rate Limit Exceeded), Key 2 is immediately called."""
        valid_chunk = b'data: {"choices":[{"delta":{"content":"Hello from Key 2"}}]}\n\n'

        def side_effect(base_url, api_key, model, messages, payload_extra=None):
            if api_key == "gsk_primary_key_00000000001":
                # Key 1 hits rate limit
                return MockStreamingResponse(
                    status_code=429,
                    error_json={"error": {"message": "Rate limit reached on TPM"}}
                ), None
            elif api_key == "gsk_secondary_key_00000002":
                # Key 2 succeeds
                return MockStreamingResponse(
                    status_code=200,
                    chunks=[valid_chunk]
                ), None
            return None, "Unknown key"

        mock_call.side_effect = side_effect

        resp = self.client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "Test"}],
            "model": "openai/gpt-oss-120b"
        })

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_call.call_count, 2)
        # First call was with Key 1
        self.assertEqual(mock_call.call_args_list[0][0][1], "gsk_primary_key_00000000001")
        # Second call was with Key 2
        self.assertEqual(mock_call.call_args_list[1][0][1], "gsk_secondary_key_00000002")

        # Verify streamed response from Key 2
        data_str = resp.data.decode("utf-8")
        self.assertIn("Hello from Key 2", data_str)

    @patch("pyrunner.app._call_chat_provider")
    def test_fallback_to_key2_when_key1_response_not_retrieved(self, mock_call):
        """When Key 1 connects (200 OK) but stream is empty/dropped, Key 2 is called."""
        valid_chunk = b'data: {"choices":[{"delta":{"content":"Retrieved from Key 2"}}]}\n\n'

        def side_effect(base_url, api_key, model, messages, payload_extra=None):
            if api_key == "gsk_primary_key_00000000001":
                # Key 1 returns 200 but empty stream (no response retrieved)
                return MockStreamingResponse(
                    status_code=200,
                    chunks=[]
                ), None
            elif api_key == "gsk_secondary_key_00000002":
                # Key 2 succeeds
                return MockStreamingResponse(
                    status_code=200,
                    chunks=[valid_chunk]
                ), None
            return None, "Unknown key"

        mock_call.side_effect = side_effect

        resp = self.client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "Test"}],
            "model": "openai/gpt-oss-120b"
        })

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_call.call_count, 2)
        self.assertEqual(mock_call.call_args_list[0][0][1], "gsk_primary_key_00000000001")
        self.assertEqual(mock_call.call_args_list[1][0][1], "gsk_secondary_key_00000002")
        data_str = resp.data.decode("utf-8")
        self.assertIn("Retrieved from Key 2", data_str)

    @patch("pyrunner.app._call_chat_provider")
    def test_fallback_to_key2_when_key1_has_network_error(self, mock_call):
        """When Key 1 encounters a network exception, Key 2 is called."""
        valid_chunk = b'data: {"choices":[{"delta":{"content":"Success after network error"}}]}\n\n'

        def side_effect(base_url, api_key, model, messages, payload_extra=None):
            if api_key == "gsk_primary_key_00000000001":
                return None, "Connection reset by peer"
            elif api_key == "gsk_secondary_key_00000002":
                return MockStreamingResponse(
                    status_code=200,
                    chunks=[valid_chunk]
                ), None
            return None, "Unknown key"

        mock_call.side_effect = side_effect

        resp = self.client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "Test"}],
            "model": "openai/gpt-oss-120b"
        })

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_call.call_count, 2)
        self.assertEqual(mock_call.call_args_list[0][0][1], "gsk_primary_key_00000000001")
        self.assertEqual(mock_call.call_args_list[1][0][1], "gsk_secondary_key_00000002")
        data_str = resp.data.decode("utf-8")
        self.assertIn("Success after network error", data_str)

    @patch("pyrunner.app._call_chat_provider")
    def test_fallback_to_key2_when_key1_returns_401_or_403(self, mock_call):
        """When Key 1 has an authentication or permission error, Key 2 is called."""
        valid_chunk = b'data: {"choices":[{"delta":{"content":"Success with valid Key 2"}}]}\n\n'

        def side_effect(base_url, api_key, model, messages, payload_extra=None):
            if api_key == "gsk_primary_key_00000000001":
                return MockStreamingResponse(
                    status_code=401,
                    error_json={"error": {"message": "Invalid API Key"}}
                ), None
            elif api_key == "gsk_secondary_key_00000002":
                return MockStreamingResponse(
                    status_code=200,
                    chunks=[valid_chunk]
                ), None
            return None, "Unknown key"

        mock_call.side_effect = side_effect

        resp = self.client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "Test"}],
            "model": "openai/gpt-oss-120b"
        })

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_call.call_count, 2)
        self.assertEqual(mock_call.call_args_list[0][0][1], "gsk_primary_key_00000000001")
        self.assertEqual(mock_call.call_args_list[1][0][1], "gsk_secondary_key_00000002")
        data_str = resp.data.decode("utf-8")
        self.assertIn("Success with valid Key 2", data_str)


if __name__ == "__main__":
    unittest.main()
