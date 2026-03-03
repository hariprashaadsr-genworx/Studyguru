from argon2 import PasswordHasher, exceptions

_pwd = PasswordHasher()


def hash_password(password: str) -> str:
    """Return an Argon2id hash of *password*."""
    return _pwd.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*, False otherwise."""
    try:
        return _pwd.verify(hashed, plain)
    except exceptions.VerifyMismatchError:
        return False
    except Exception as exc:
        # Log unexpected errors but never crash the login endpoint
        import logging
        logging.getLogger(__name__).warning("Password verification error: %s", exc)
        return False
