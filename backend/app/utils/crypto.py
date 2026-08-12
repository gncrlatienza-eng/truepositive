from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class CredentialDecryptionError(Exception):
    pass


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    try:
        return Fernet(settings.credential_encryption_key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "CREDENTIAL_ENCRYPTION_KEY must be a valid 32-byte urlsafe-base64 Fernet key "
            '(generate one with: python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())")'
        ) from exc


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise CredentialDecryptionError("Stored credential could not be decrypted") from exc
