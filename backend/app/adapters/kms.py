"""Key provider for envelope encryption.

Posture (docs/safety-and-privacy.md): each user has a per-user **data key**,
stored **wrapped** by a KMS-managed **master key**. Sensitive columns are
encrypted with the data key; the data key is only ever unwrapped in-process and
never persisted or logged in plaintext. Deleting the wrapped data key
crypto-shreds the user's data (DPDP erasure).

This interface abstracts the master key so it can move from a self-managed key
to a managed cloud KMS without touching call sites. Concrete bodies land in the
chat / encryption prompt.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class DataKey:
    """A freshly generated data key.

    `plaintext` lives in process memory only — never persist or log it. Persist
    `wrapped` (in `encryption_keys`); unwrap on demand to use `plaintext`.
    """

    plaintext: bytes
    wrapped: bytes

    def __repr__(self) -> str:  # never leak key bytes into logs/reprs
        return "DataKey(plaintext=<redacted>, wrapped=<redacted>)"


class KeyProvider(Protocol):
    """Master-key operations for per-user envelope encryption."""

    def generate_data_key(self) -> DataKey:
        """Generate a new data key, returning plaintext + master-wrapped form."""
        ...

    def unwrap_data_key(self, wrapped: bytes) -> bytes:
        """Unwrap a stored data key to plaintext (in-process use only)."""
        ...


class KmsKeyProvider:
    """KMS-backed implementation. Bodies land in the encryption prompt."""

    def generate_data_key(self) -> DataKey:
        raise NotImplementedError("generate_data_key: implemented in a later prompt")

    def unwrap_data_key(self, wrapped: bytes) -> bytes:
        raise NotImplementedError("unwrap_data_key: implemented in a later prompt")
