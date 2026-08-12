import pytest

from app.utils import crypto


def test_round_trip():
    ciphertext = crypto.encrypt_secret("hunter2")
    assert ciphertext != "hunter2"
    assert crypto.decrypt_secret(ciphertext) == "hunter2"


def test_tampered_token_raises():
    ciphertext = crypto.encrypt_secret("hunter2")
    tampered = ciphertext[:-4] + "aaaa"
    with pytest.raises(crypto.CredentialDecryptionError):
        crypto.decrypt_secret(tampered)
