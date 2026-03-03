from argon2 import PasswordHasher, exceptions
import asyncio
import logging

_pwd = PasswordHasher()


async def hash_password(password: str) -> str:
    """Return an Argon2id hash of *password*."""
    return await asyncio.to_thread(_pwd.hash, password)


async def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*, False otherwise."""
    try:
        return await asyncio.to_thread(_pwd.verify, hashed, plain)
    except exceptions.VerifyMismatchError:
        return False
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "Password verification error: %s", exc
        )
        return False