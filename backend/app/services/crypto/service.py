"""Envelope encryption service.

Provides AES-256-GCM encryption/decryption using per-user Data Encryption Keys (DEKs)
wrapped by a master key. Plaintext keys are never stored in the database or logged.
"""

from __future__ import annotations

import hashlib
import os
from typing import Any, Protocol

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.supabase import get_supabase


class KeyProvider(Protocol):
    """Protocol defining the Key Management Service (KMS) key wrapping interface."""

    async def wrap_key(self, plaintext_key: bytes) -> bytes:
        """Wrap (encrypt) a data key with the KMS master key."""
        ...

    async def unwrap_key(self, wrapped_key: bytes) -> bytes:
        """Unwrap (decrypt) a wrapped data key with the KMS master key."""
        ...


class LocalKeyProvider:
    """Development/local key provider.

    Wraps and unwraps user data keys using a master key derived from environmental
    settings. Swappable with a managed KMS provider in staging/production.
    """

    def __init__(self, master_key: bytes) -> None:
        self._master_key = master_key

    async def wrap_key(self, plaintext_key: bytes) -> bytes:
        # GCM nonce size is 12 bytes
        nonce = os.urandom(12)
        aesgcm = AESGCM(self._master_key)
        # Wrap the key (no authenticated data)
        ciphertext = aesgcm.encrypt(nonce, plaintext_key, None)
        return nonce + ciphertext

    async def unwrap_key(self, wrapped_key: bytes) -> bytes:
        if len(wrapped_key) < 12:
            raise ValueError("Invalid wrapped key format (too short)")
        nonce = wrapped_key[:12]
        ciphertext = wrapped_key[12:]
        aesgcm = AESGCM(self._master_key)
        return aesgcm.decrypt(nonce, ciphertext, None)


# --- Global Key Provider Setup ---


def _get_local_master_key() -> bytes:
    settings = get_settings()
    master_key_str = (
        settings.KMS_MASTER_KEY_ID or "local-dev-fallback-master-key-must-change-in-prod"
    )
    # Derive a 256-bit (32-byte) key for AES-256
    return hashlib.sha256(master_key_str.encode("utf-8")).digest()


_global_key_provider = LocalKeyProvider(_get_local_master_key())


def get_key_provider() -> KeyProvider:
    """Return the active KeyProvider dependency."""
    return _global_key_provider


# --- Helper to Parse bytea column values ---


def parse_bytea(val: Any) -> bytes:
    """Parse Postgrest bytea response into raw bytes, handling hex and string formats."""
    if isinstance(val, bytes):
        return val
    if isinstance(val, str):
        # Postgrest often returns bytea as hex starting with \x
        if val.startswith("\\x"):
            return bytes.fromhex(val[2:])
        return bytes.fromhex(val)
    raise ValueError(f"Unexpected type for bytea value: {type(val)}")


# --- Public Crypto Service Interface ---


async def get_or_create_user_dek(user_id: str) -> bytes:
    """Lazily fetch or create a Data Encryption Key (DEK) for the given user."""
    sb = get_supabase()
    provider = get_key_provider()
    settings = get_settings()

    # 1. Try to fetch existing key
    def _fetch() -> Any:
        return sb.table("encryption_keys").select("*").eq("user_id", user_id).limit(1).execute()

    res = await run_in_threadpool(_fetch)
    rows = res.data or []

    if rows:
        wrapped_dek = parse_bytea(rows[0]["wrapped_dek"])
        return await provider.unwrap_key(wrapped_dek)

    # 2. Key does not exist, generate a fresh 32-byte key
    plaintext_dek = os.urandom(32)
    wrapped_dek = await provider.wrap_key(plaintext_dek)

    def _insert() -> Any:
        row = {
            "user_id": user_id,
            "wrapped_dek": "\\x" + wrapped_dek.hex(),
            "master_key_id": settings.KMS_MASTER_KEY_ID or "local-dev",
            "algorithm": "AES-256-GCM",
        }
        return sb.table("encryption_keys").insert(row).execute()

    try:
        await run_in_threadpool(_insert)
    except Exception:
        # In case of a race condition, double check if another thread succeeded
        res_retry = await run_in_threadpool(_fetch)
        retry_rows = res_retry.data or []
        if retry_rows:
            wrapped_dek = parse_bytea(retry_rows[0]["wrapped_dek"])
            return await provider.unwrap_key(wrapped_dek)
        raise

    return plaintext_dek


async def encrypt(user_id: str, plaintext: str) -> tuple[bytes, bytes]:
    """Encrypt plaintext using the user's DEK with AES-256-GCM.

    Returns:
        (ciphertext, nonce)
    """
    dek = await get_or_create_user_dek(user_id)
    nonce = os.urandom(12)
    aesgcm = AESGCM(dek)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return ciphertext, nonce


async def decrypt(user_id: str, ciphertext: bytes, nonce: bytes) -> str:
    """Decrypt ciphertext using the user's DEK with AES-256-GCM."""
    dek = await get_or_create_user_dek(user_id)
    aesgcm = AESGCM(dek)
    plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext_bytes.decode("utf-8")


async def crypto_shred_user(user_id: str) -> None:
    """Delete the user's encryption key.

    Renders all envelope-encrypted columns unrecoverable.
    """
    sb = get_supabase()

    def _delete() -> Any:
        return sb.table("encryption_keys").delete().eq("user_id", user_id).execute()

    await run_in_threadpool(_delete)


# --- Serialization Helpers for Text Columns ---


async def encrypt_string_to_text(user_id: str, plaintext: str | None) -> str | None:
    """Encrypt a string and format it as hex-nonce:hex-ciphertext for text columns."""
    if plaintext is None:
        return None
    ciphertext, nonce = await encrypt(user_id, plaintext)
    return f"{nonce.hex()}:{ciphertext.hex()}"


async def decrypt_text_to_string(user_id: str, encrypted_text: str | None) -> str | None:
    """Decrypt a hex-nonce:hex-ciphertext string back to plaintext.

    If the string is not formatted with a colon, it returns the value as-is,
    acting as a fallback for plaintext values.
    """
    if encrypted_text is None:
        return None
    parts = encrypted_text.split(":")
    if len(parts) != 2:
        return encrypted_text  # Return as-is if it's plaintext
    try:
        nonce = bytes.fromhex(parts[0])
        ciphertext = bytes.fromhex(parts[1])
        return await decrypt(user_id, ciphertext, nonce)
    except Exception:
        # Fallback to as-is if decoding or decryption fails
        return encrypted_text
