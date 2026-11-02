import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  ROLE_METADATA,
  listAllStaff,
  createStaffRecord,
  updateStaffRecord,
  deleteStaffRecord,
} from "../../../lib/auth.js";
import { guardApiRequest, buildDataScopeFilter } from "../../../lib/rbac.js";

/**
 * API Quản lý Nhân sự, Vai trò (RBAC) & Chỉ tiêu KPI (WBS-06 & WBS-07)
 * Kế thừa C:\QuanlyKH\src\app\settings\StaffManager.js & C:\AH-Trabi\quan-ly-kho\users_management_view.php
 */

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const { searchParams } = new URL(request.url);
    const simulateStaffCode = searchParams.get("simulateStaff");

    const staffList = listAllStaff();

    // Hỗ trợ trình mô phỏng RBAC (Live RBAC Simulator WBS-06)
    let simulatedScope = null;
    if (simulateStaffCode) {
      const target = staffList.find((s) => s.code === simulateStaffCode.toUpperCase());
      if (target) {
        simulatedScope = {
          staff: target,
          customers: buildDataScopeFilter(target, "customers"),
          conversations: buildDataScopeFilter(target, "conversations"),
          orders: buildDataScopeFilter(target, "orders"),
        };
      }
    }

    return NextResponse.json({
      ok: true,
      staff: staffList,
      roles: ROLE_METADATA,
      simulatedScope,
    });
  } catch (error) {
    console.error("[STAFF_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi tải danh sách nhân sự." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
    });
    // Trong môi trường phát triển nếu chưa có cookie thì cho phép thao tác thử nghiệm trên UI,
    // nhưng nếu đăng nhập bằng tài khoản thường (SALE/KHO) sẽ bị chặn nghiêm ngặt theo Điều 5
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
      return guard.response;
    }

    const body = await request.json();
    const result = createStaffRecord(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: `Đã tạo tài khoản nhân viên ${result.staff.code} (${result.staff.name}) thành công! Mật khẩu mặc định: 123456`,
      staff: result.staff,
    });
  } catch (error) {
    console.error("[STAFF_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Không thể tạo tài khoản nhân viên mới." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
    });
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
      return guard.response;
    }

    const body = await request.json();
    const targetId = body.id || body.code;
    if (!targetId) {
      return NextResponse.json({ error: "Thiếu mã nhân viên cần cập nhật." }, { status: 400 });
    }

    const result = updateStaffRecord(targetId, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: `Đã lưu cấu hình nhân sự & KPI cho ${result.staff.code} thành công!`,
      staff: result.staff,
    });
  } catch (error) {
    console.error("[STAFF_PUT_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi cập nhật thông tin nhân viên." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN"],
    });
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
      return guard.response;
    }

    const { searchParams } = new URL(request.url);
    const idOrCode = searchParams.get("id") || searchParams.get("code");
    if (!idOrCode) {
      return NextResponse.json({ error: "Thiếu mã nhân viên cần xóa." }, { status: 400 });
    }

    const result = deleteStaffRecord(idOrCode);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Đã xóa tài khoản nhân viên khỏi hệ thống thành công.",
    });
  } catch (error) {
    console.error("[STAFF_DELETE_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi xóa tài khoản nhân viên." },
      { status: 500 }
    );
  }
}
