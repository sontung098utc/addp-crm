import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, getStaffByIdOrCode } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  let user = verifySessionToken(token);

  if (!user) {
    // Mặc định phiên làm việc Quản trị viên ADDP (ADMIN) để người dùng thao tác thông suốt
    user = getStaffByIdOrCode("ADMIN");
  }

  return NextResponse.json({ authenticated: true, user });
}
