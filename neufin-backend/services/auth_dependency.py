from fastapi import Request, HTTPException, status
from services.jwt_auth import verify_jwt, JWTUser


async def get_current_user(request: Request) -> JWTUser:
    auth = request.headers.get("Authorization")

    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token",
        )

    token = auth.split(" ")[1]

    try:
        user = await verify_jwt(token)
        return user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
