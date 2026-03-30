from fastapi import HTTPException, Request, status

from services.jwt_auth import JWTUser, verify_jwt


def _extract_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if not auth:
        return None

    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth header",
        )

    return auth.split(" ", 1)[1]


async def get_current_user(request: Request) -> JWTUser:
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token",
        )

    try:
        user = await verify_jwt(token)
        return user
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from err


async def get_optional_user(request: Request) -> JWTUser | None:
    token = _extract_bearer_token(request)
    if not token:
        return None

    try:
        return await verify_jwt(token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from err
