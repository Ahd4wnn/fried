"""Unit tests for app-level envelope encryption service."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from cryptography.exceptions import InvalidTag

from app.services.crypto.migration import migrate_onboarding_responses
from app.services.crypto.service import (
    crypto_shred_user,
    decrypt,
    decrypt_text_to_string,
    encrypt,
    encrypt_string_to_text,
)


class TestCryptoService(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.user_a = "user-uuid-aaaa-bbbb-cccc"
        self.user_b = "user-uuid-bbbb-cccc-dddd"
        self.db_store = {}

    def _mock_supabase(self):
        """Create a mocked Supabase client that reads/writes from local dict."""
        mock_client = MagicMock()
        mock_keys_table = MagicMock()
        mock_onboarding_table = MagicMock()

        def mock_table(name):
            if name == "encryption_keys":
                return mock_keys_table
            if name == "onboarding_responses":
                return mock_onboarding_table
            return MagicMock()

        mock_client.table = mock_table

        # Mock encryption_keys table select
        def mock_select(columns="*"):
            selected_table = MagicMock()

            def mock_eq(col, val):
                eq_res = MagicMock()
                if col == "user_id":
                    rows = [self.db_store[val]] if val in self.db_store else []
                    eq_res.limit.return_value.execute.return_value = MagicMock(data=rows)
                return eq_res

            selected_table.eq = mock_eq
            return selected_table

        mock_keys_table.select = mock_select

        def mock_insert(row):
            uid = row["user_id"]
            self.db_store[uid] = row
            insert_res = MagicMock()
            insert_res.execute.return_value = MagicMock(data=[row])
            return insert_res

        mock_keys_table.insert = mock_insert

        def mock_delete():
            delete_res = MagicMock()

            def mock_eq(col, val):
                if col == "user_id" and val in self.db_store:
                    del self.db_store[val]
                eq_res = MagicMock()
                eq_res.execute.return_value = MagicMock(data=[])
                return eq_res

            delete_res.eq = mock_eq
            return delete_res

        mock_keys_table.delete = mock_delete

        return mock_client

    @patch("app.services.crypto.service.get_supabase")
    async def test_roundtrip_encrypt_decrypt(self, mock_get_supabase: MagicMock) -> None:
        """Verify that encryption followed by decryption returns the original string."""
        mock_get_supabase.return_value = self._mock_supabase()

        plaintext = "This is a very sensitive mental health note."
        ciphertext, nonce = await encrypt(self.user_a, plaintext)

        decrypted = await decrypt(self.user_a, ciphertext, nonce)
        self.assertEqual(decrypted, plaintext)

        # Verify key exists in db store
        self.assertIn(self.user_a, self.db_store)

    @patch("app.services.crypto.service.get_supabase")
    async def test_user_isolation(self, mock_get_supabase: MagicMock) -> None:
        """Verify that User B cannot decrypt User A's ciphertext using User B's DEK."""
        mock_client = self._mock_supabase()
        mock_get_supabase.return_value = mock_client

        plaintext = "User A's private diary."
        ciphertext, nonce = await encrypt(self.user_a, plaintext)

        # Try to decrypt using User B's DEK (should fail)
        with self.assertRaises(InvalidTag):
            await decrypt(self.user_b, ciphertext, nonce)

    @patch("app.services.crypto.service.get_supabase")
    async def test_crypto_shredding(self, mock_get_supabase: MagicMock) -> None:
        """Verify that deleting the user key makes decrypting old ciphertext fail."""
        mock_get_supabase.return_value = self._mock_supabase()

        plaintext = "Sensitive data to be shredded."
        ciphertext, nonce = await encrypt(self.user_a, plaintext)

        # Shred user key
        await crypto_shred_user(self.user_a)
        self.assertNotIn(self.user_a, self.db_store)

        # Attempt to decrypt. Since key is shredded, fetching DEK will lazily create
        # a NEW random DEK, which will fail to decrypt the old ciphertext.
        with self.assertRaises(InvalidTag):
            await decrypt(self.user_a, ciphertext, nonce)

    @patch("app.services.crypto.service.get_supabase")
    async def test_text_serialization_helpers(self, mock_get_supabase: MagicMock) -> None:
        """Verify serialization helpers for text columns encrypt and decrypt correctly."""
        mock_get_supabase.return_value = self._mock_supabase()

        plaintext = "WhatsAppNumber12345"
        serialized = await encrypt_string_to_text(self.user_a, plaintext)
        self.assertIsNotNone(serialized)
        self.assertIn(":", serialized)

        # Round-trip decrypt
        deserialized = await decrypt_text_to_string(self.user_a, serialized)
        self.assertEqual(deserialized, plaintext)

        # Verify fallback for unencrypted strings
        self.assertEqual(
            await decrypt_text_to_string(self.user_a, "raw_plain_text"), "raw_plain_text"
        )
        self.assertIsNone(await decrypt_text_to_string(self.user_a, None))

    @patch("app.services.crypto.migration.get_supabase")
    @patch("app.services.crypto.service.get_supabase")
    async def test_retroactive_migration(
        self, mock_service_supabase: MagicMock, mock_mig_supabase: MagicMock
    ) -> None:
        """Verify retroactive migration encrypts raw plaintext values in place."""
        # Share the mock client and database store
        mock_client = self._mock_supabase()
        mock_service_supabase.return_value = mock_client
        mock_mig_supabase.return_value = mock_client

        # Seed onboarding_responses with 1 raw plaintext row and 1 already-encrypted row
        onboarding_db = [
            {
                "user_id": self.user_a,
                "past_therapy_note": "I tried therapy in 2024.",
                "therapist_should_know": "I get anxious at night.",
                "whatsapp_number": "9999988888",
            },
            {
                "user_id": self.user_b,
                "past_therapy_note": "010203040506:0708090a",  # already encrypted format
                "therapist_should_know": None,
                "whatsapp_number": None,
            },
        ]

        mock_onboarding_table = mock_client.table("onboarding_responses")
        mock_onboarding_table.select.return_value.execute.return_value = MagicMock(
            data=onboarding_db
        )

        # Capture updates
        updated_rows = {}

        def mock_update(patch):
            def mock_eq(col, val):
                if col == "user_id":
                    updated_rows[val] = patch
                eq_res = MagicMock()
                eq_res.execute.return_value = MagicMock(data=[])
                return eq_res

            delete_res = MagicMock()
            delete_res.eq = mock_eq
            return delete_res

        mock_onboarding_table.update = mock_update

        # Run migration
        migrated = await migrate_onboarding_responses()
        self.assertEqual(migrated, 1)

        # Assert user_a was migrated and values are encrypted (contain colons)
        self.assertIn(self.user_a, updated_rows)
        self.assertIn(":", updated_rows[self.user_a]["past_therapy_note"])
        self.assertIn(":", updated_rows[self.user_a]["therapist_should_know"])
        self.assertIn(":", updated_rows[self.user_a]["whatsapp_number"])

        # Assert user_b was not migrated (already encrypted or nulls)
        self.assertNotIn(self.user_b, updated_rows)
