import { NextResponse } from "next/server";
import { authenticateStaff, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, password } = body || {};

    const user = authenticateStaff(username, password);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Mã nhân viên hoặc mật khẩu không chính xác." },
        { status: 401 }
      );
    }

    const token = createSessionToken(user);
    const response = NextResponse.json({ ok: true, user });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Lỗi xử lý đăng nhập: " + err.message },
      { status: 500 }
    );
  }
}
