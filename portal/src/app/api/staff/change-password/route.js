import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, updateStaffPassword } from "@/lib/auth";

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    let token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = request.headers.get("authorization") || "";
      if (authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.slice(7).trim();
      }
    }
    const currentUser = verifySessionToken(token);

    if (!currentUser) {
      return NextResponse.json(
        { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } = await request.json();
    const result = updateStaffPassword(currentUser.code, currentPassword, newPassword);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Đã cập nhật mật khẩu mới thành công!",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Không thể đổi mật khẩu: " + err.message },
      { status: 500 }
    );
  }
}
