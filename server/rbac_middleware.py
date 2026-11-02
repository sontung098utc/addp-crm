"""
ADDP Omnichannel AI CRM — FastAPI RBAC & Data Scope Middleware (WBS-06)
Dùng chung chữ ký HMAC-SHA256 (CRM_JWT_SECRET) với Next.js Portal (portal/src/lib/auth.js).
Tuân thủ Điều 5 - AGENTS.md:
- Kiểm tra role (ADMIN, SALE_LEADER, SALE, CSKH, KHO, KE_TOAN) và staffId.
- Chặn SALE/CSKH truy cập kênh không được phân quyền hoặc xuất toàn bộ danh sách khách hàng.
"""

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Callable, Dict, List, Optional

try:
    from fastapi import Depends, HTTPException, Request, status
except ImportError:  # Cho phép chạy unit-test độc lập ngoài môi trường FastAPI
    Depends = lambda x=None: x
    Request = Any

    class status:
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)

SESSION_COOKIE_NAME = "addp_crm_session"
CRM_JWT_SECRET = os.getenv("CRM_JWT_SECRET", "ADDP_CRM_DEFAULT_DEV_SECRET_2026")


def verify_crm_session_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Giải mã và kiểm tra chữ ký HMAC-SHA256 của token phiên đăng nhập từ crm.addp.vn."""
    if not token or "." not in token:
        return None
    try:
        b64_payload, signature = token.split(".", 1)
        expected_sig = base64.urlsafe_b64encode(
            hmac.new(
                CRM_JWT_SECRET.encode("utf-8"),
                b64_payload.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode("utf-8").rstrip("=")

        if not hmac.compare_digest(signature.rstrip("="), expected_sig):
            return None

        padded = b64_payload + "=" * (-len(b64_payload) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        exp_ms = payload.get("exp", 0)
        if exp_ms and (time.time() * 1000) > exp_ms:
            return None
        return payload
    except Exception:
        return None


async def get_current_staff(request: Request) -> Dict[str, Any]:
    """FastAPI Dependency lấy thông tin nhân sự từ Cookie hoặc Authorization Bearer Header."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()

    staff = verify_crm_session_token(token)
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập tại crm.addp.vn.",
        )
    return staff


def require_roles(allowed_roles: List[str]) -> Callable:
    """Dependency kiểm tra vai trò (RBAC) cho các API endpoint trên Javis OS FastAPI."""

    async def _role_checker(staff: Dict[str, Any] = Depends(get_current_staff)) -> Dict[str, Any]:
        role = staff.get("role", "SALE")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Từ chối truy cập (RBAC): Vai trò '{role}' không được phép thực hiện thao tác này.",
            )
        return staff

    return _role_checker


def build_sql_scope_condition(staff: Dict[str, Any], table_alias: str = "c") -> Dict[str, Any]:
    """
    Trả về điều kiện lọc dữ liệu theo staffId và allowedChannelAccountIds
    để gắn vào câu truy vấn SQL/ORM theo Điều 5 AGENTS.md.
    """
    role = staff.get("role", "SALE")
    staff_id = int(staff.get("id", 0))
    allowed_channels = staff.get("allowedChannelAccountIds") or []

    if role == "ADMIN":
        return {
            "scope": "COMPANY_ALL",
            "where_sql": "1=1",
            "params": {},
            "can_view_cost": True,
            "can_export_all": True,
        }

    if role in ("KHO", "KE_TOAN"):
        return {
            "scope": "OPERATIONS_ONLY",
            "where_sql": "1=1",
            "params": {},
            "can_view_cost": role == "KE_TOAN",
            "can_export_all": False,
        }

    if role == "SALE_LEADER":
        return {
            "scope": "TEAM_SCOPE",
            "where_sql": f"{table_alias}.team_name = :team_name OR {table_alias}.staff_id = :staff_id",
            "params": {"team_name": staff.get("teamName", ""), "staff_id": staff_id},
            "can_view_cost": False,
            "can_export_all": False,
        }

    # SALE / CSKH: Chỉ xem dữ liệu được gán cho chính mình (staff_id == currentUser.id)
    return {
        "scope": "OWN_ASSIGNED_ONLY",
        "where_sql": f"{table_alias}.staff_id = :staff_id",
        "params": {"staff_id": staff_id, "allowed_channels": allowed_channels},
        "can_view_cost": False,
        "can_export_all": False,
    }
