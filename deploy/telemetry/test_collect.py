import json
import sqlite3
import unittest
from unittest.mock import patch

import collect


class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        collect.initialize(self.db)

    def tearDown(self):
        self.db.close()

    def test_api_requests_are_aggregated_without_identifiers_and_without_replay(self):
        stamp = "2026-09-26T20:00:00.123456789Z"
        event = {"event": "http_request_aggregate", "minute": "2026-09-26T20:00Z",
                 "method": "PUT", "route": "/tests/:testId/answers/:questionId",
                 "status_class": 5, "requests": 1, "duration_sum_ms": 611,
                 "duration_max_ms": 611, "buckets": [0, 0, 0, 0, 1, 0, 0, 0]}
        logs = f"{stamp} {json.dumps(event)}\n"
        with patch.object(collect, "command", return_value=logs):
            collect.api_samples(self.db, stamp)
            collect.api_samples(self.db, stamp)
        row = self.db.execute("SELECT minute,route,status_class,requests,duration_sum_ms,buckets_json FROM api_minutes").fetchone()
        self.assertEqual(row[:5], ("2026-09-26T20:00Z", "/tests/:testId/answers/:questionId", 5, 1, 611))
        self.assertEqual(json.loads(row[5])[4], 1)
        self.assertNotIn("secret-id", "\n".join(self.db.iterdump()))

    def test_edge_logs_strip_paths_and_query_strings(self):
        stamp = "2026-09-26T20:01:02.123456789Z"
        event = {"request": {"uri": "/api/v1/tests/secret-id?token=secret"},
                 "status": 200, "size": 2048, "duration": 0.125}
        with patch.object(collect, "command", return_value=f"{stamp} {json.dumps(event)}\n"):
            collect.edge_samples(self.db, stamp)
        self.assertEqual(self.db.execute("SELECT category,requests,response_bytes,duration_sum_ms FROM edge_minutes").fetchone(),
                         ("/api/v1/tests", 1, 2048, 125))
        self.assertNotIn("secret-id", "\n".join(self.db.iterdump()))
        self.assertNotIn("token=secret", "\n".join(self.db.iterdump()))

    def test_byte_units(self):
        self.assertEqual(collect.bytes_value("2.5GiB"), int(2.5 * 1024**3))
        self.assertEqual(collect.bytes_value("20.2MB"), 20_200_000)


if __name__ == "__main__":
    unittest.main()
