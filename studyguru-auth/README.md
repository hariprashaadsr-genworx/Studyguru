# StudyGuru Auth Service

Standalone JWT-based authentication microservice for **StudyGuru**.

## Features

| Feature | Detail |
|---|---|
| **Sign-up / Login** | Email + Argon2id password |
| **Access tokens** | Short-lived JWT (default 60 min) |
| **Refresh tokens** | Long-lived JWT (default 7 days), rotated on every use |
| **Token revocation** | `revoked_tokens` table; checked on every protected request |
| **Logout** | Single-device or logout-everywhere |
| **Google OAuth** | Full PKCE flow; returns token pair to frontend |
| **DB init on startup** | `init_db()` called in FastAPI lifespan |

## Tables

```
users            – id, name, email, hashed_password, google_id, pic, is_active
sessions         – id, user_id, refresh_jti, refresh_token, expires_at
revoked_tokens   – id, jti, token_type, expires_at, revoked_at
```

## Quickstart

```bash
cp .env.example .env          # fill in SECRET_KEY, REFRESH_SECRET_KEY, DATABASE_URL
pip install -r requirements.txt
python main.py                # server starts on :8001, DB auto-created
```

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | – | Register; returns token pair |
| `POST` | `/api/auth/login` | – | Login; returns token pair |
| `POST` | `/api/auth/refresh` | – | Rotate refresh token |
| `POST` | `/api/auth/logout` | ✓ Bearer | Revoke tokens |
| `GET`  | `/api/auth/me` | ✓ Bearer | Current user profile |
| `GET`  | `/api/auth/google` | – | Start Google OAuth |
| `GET`  | `/api/auth/google/callback` | – | Google OAuth callback |
| `GET`  | `/api/health` | – | Healthcheck |

### Logout body (all fields optional)
```json
{
  "refresh_token": "<refresh-jwt>",
  "logout_all": false
}
```
Set `logout_all: true` to destroy every session for the user (logout everywhere).

## Interactive docs

`http://localhost:8001/docs`
