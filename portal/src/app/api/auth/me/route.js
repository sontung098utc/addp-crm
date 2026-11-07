import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, getStaffByIdOrCode } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const parsed = verifySessionToken(token);

  if (!parsed) {
    return NextResponse.json(
      { authenticated: false, user: null, error: "Chưa đăng nhập phiên làm việc." },
      { status: 401 }
    );
  }

  const user = getStaffByIdOrCode(parsed.code || parsed.id) || parsed;
  return NextResponse.json({ authenticated: true, user });
}
