"""
ADDP Omnichannel AI CRM — Cầu nối Xác thực SSO/JWT giữa Next.js Portal & Javis OS FastAPI (WBS-09)
Cho phép nhân viên đăng nhập 1 lần trên https://crm.addp.vn (Next.js) và sử dụng ngay
các API Đa kênh, AI Chatbot, Zalo QR & SmartBroadcastQueue trên Javis OS FastAPI (server/).
"""

import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict, Optional

from rbac_middleware import (
    CRM_JWT_SECRET,
    SESSION_COOKIE_NAME,
    build_sql_scope_condition,
    verify_crm_session_token,
)

# Bộ nhớ đệm vé WebSocket ngắn hạn (TTL = 60 giây)
_WS_TICKET_STORE: Dict[str, Dict[str, Any]] = {}


def issue_ws_ticket(staff_payload: Dict[str, Any], ttl_seconds: int = 60) -> Dict[str, Any]:
    """Cấp vé một lần (One-time WS Ticket) để trình duyệt kết nối WebSocket thời gian thực."""
    now = time.time()
    # Dọn các vé đã hết hạn
    expired_keys = [k for k, v in _WS_TICKET_STORE.items() if v["expires_at"] < now]
    for k in expired_keys:
        _WS_TICKET_STORE.pop(k, None)

    raw_nonce = secrets.token_urlsafe(18)
    sig = hmac.new(
        CRM_JWT_SECRET.encode("utf-8"),
        f"{staff_payload.get('code')}:{raw_nonce}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:16]
    ticket = f"wst_{raw_nonce}.{sig}"

    record = {
        "ticket": ticket,
        "staff": staff_payload,
        "issued_at": int(now * 1000),
        "expires_at": now + ttl_seconds,
    }
    _WS_TICKET_STORE[ticket] = record
    return record


def consume_ws_ticket(ticket: str) -> Optional[Dict[str, Any]]:
    """Kiểm tra và tiêu thụ vé WebSocket một lần."""
    record = _WS_TICKET_STORE.pop(ticket, None)
    if not record:
        return None
    if time.time() > record["expires_at"]:
        return None
    return record["staff"]


def exchange_portal_token(token: str) -> Dict[str, Any]:
    """
    Xác thực token từ Next.js Portal và trả về thông tin phiên SSO hợp nhất
    cùng bộ lọc phân quyền RBAC trên Javis OS FastAPI.
    """
    staff = verify_crm_session_token(token)
    if not staff:
        return {
            "ok": False,
            "error": "Token SSO không hợp lệ hoặc đã hết hạn.",
        }

    sql_scope = build_sql_scope_condition(staff)
    ws_ticket_info = issue_ws_ticket(staff)

    return {
        "ok": True,
        "bridge": "addp-crm-sso-v1",
        "domain": os.getenv("CRM_DOMAIN", "crm.addp.vn"),
        "staff": {
            "id": staff.get("id"),
            "code": staff.get("code"),
            "name": staff.get("name"),
            "role": staff.get("role"),
            "roleLabel": staff.get("roleLabel"),
            "teamName": staff.get("teamName"),
            "dailyCareTarget": staff.get("dailyCareTarget", 0),
            "dailyMsgTarget": staff.get("dailyMsgTarget", 70),
            "allowedChannelAccountIds": staff.get("allowedChannelAccountIds", []),
        },
        "rbacScope": sql_scope,
        "wsTicket": ws_ticket_info["ticket"],
        "wsExpiresAt": int(ws_ticket_info["expires_at"] * 1000),
    }


def register_crm_sso_routes(app: Any) -> None:
    """Đăng ký các API endpoint SSO/JWT vào ứng dụng FastAPI của Javis OS (`server/main.py`)."""
    try:
        from fastapi import Body, Request
        from fastapi.responses import JSONResponse
    except ImportError:
        return

    @app.get("/api/crm/sso/whoami")
    async def crm_sso_whoami(request: Request):
        token = request.cookies.get(SESSION_COOKIE_NAME)
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.lower().startswith("bearer "):
                token = auth_header[7:].strip()

        result = exchange_portal_token(token or "")
        if not result["ok"]:
            return JSONResponse(status_code=401, content=result)
        return JSONResponse(content=result)

    @app.post("/api/crm/sso/exchange")
    async def crm_sso_exchange(payload: Dict[str, Any] = Body(default={})):
        token = payload.get("token") or ""
        result = exchange_portal_token(token)
        if not result["ok"]:
            return JSONResponse(status_code=401, content=result)

        response = JSONResponse(content=result)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            httponly=True,
            samesite="lax",
            path="/",
            max_age=30 * 24 * 3600,
        )
        return response
