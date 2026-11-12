import {
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  normalizePhone,
  isValidVietnamPhone,
} from "../../../../lib/customerIdentityResolver.js";
import { getSessionStaff, listAllStaff } from "../../../../lib/auth.js";
import { filterRecordsByRbac } from "../../../../lib/rbac.js";
import { buildCareSchedule } from "../../../../lib/careAutomation.js";
import { updateConversationTags, removeConversationTags } from "../../../../lib/tagStore.js";

// Force dynamic execution for customer detail API
export const dynamic = "force-dynamic";

function canAccessCustomerRecord(currentStaff, customer) {
  if (!currentStaff || !customer) return false;
  return filterRecordsByRbac(currentStaff, [customer], "customers").length > 0;
}

export async function GET(request, { params }) {
  try {
    const currentStaff = await getSessionStaff(request);
    if (!currentStaff) {
      return Response.json(
        { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const customer = getCustomerById(id);

    if (!customer) {
      return Response.json({ ok: false, error: "Không tìm thấy khách hàng" }, { status: 404 });
    }

    if (!canAccessCustomerRecord(currentStaff, customer)) {
      return Response.json(
        { ok: false, error: "Từ chối truy cập: Bạn không phụ trách khách hàng này" },
        { status: 403 }
      );
    }

    const primaryProduct =
      (Array.isArray(customer.purchasedProducts) && customer.purchasedProducts[0]) ||
      customer.lastProduct ||
      "Sản phẩm ADDP";

    const careSchedule = buildCareSchedule({
      customerName: customer.fullName,
      productName: primaryProduct,
      startDate: customer.lastOrderDate || new Date(),
      durationDays: 30,
    });

    return Response.json({
      ok: true,
      customer,
      careSchedule,
    });
  } catch (error) {
    console.error("GET /api/customers/[id] error:", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const currentStaff = await getSessionStaff(request);
    if (!currentStaff) {
      return Response.json(
        { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const existing = getCustomerById(id);
    if (!existing) {
      return Response.json(
        { ok: false, error: "Không tìm thấy khách hàng để cập nhật" },
        { status: 404 }
      );
    }

    if (!canAccessCustomerRecord(currentStaff, existing)) {
      return Response.json(
        { ok: false, error: "Từ chối quyền sửa: Khách hàng này không thuộc phạm vi phụ trách của bạn." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates = {};

    if (body.fullName !== undefined) {
      const cleanName = String(body.fullName || "").trim();
      if (!cleanName) {
        return Response.json(
          { ok: false, error: "Họ và tên khách hàng không được để trống." },
          { status: 400 }
        );
      }
      updates.fullName = cleanName;
    }

    if (body.phone !== undefined) {
      const cleanPhone = normalizePhone(body.phone);
      if (cleanPhone && !isValidVietnamPhone(cleanPhone)) {
        return Response.json(
          { ok: false, error: "Số điện thoại không hợp lệ. Vui lòng nhập SĐT chuẩn 10 số Việt Nam." },
          { status: 400 }
        );
      }
      updates.phone = cleanPhone || String(body.phone || "").trim();
    }

    if (body.assignedStaff !== undefined || body.staffId !== undefined) {
      const allStaff = listAllStaff();
      let matchedStaff = null;
      if (body.staffId) {
        matchedStaff = allStaff.find((s) => Number(s.id) === Number(body.staffId));
      }
      if (!matchedStaff && body.assignedStaff) {
        const targetLower = String(body.assignedStaff).trim().toLowerCase();
        matchedStaff = allStaff.find(
          (s) =>
            String(s.fullName || s.name || "").trim().toLowerCase() === targetLower ||
            String(s.code || "").trim().toLowerCase() === targetLower
        );
      }
      const staffLabel = String(
        body.assignedStaff || matchedStaff?.fullName || matchedStaff?.name || existing.assignedStaff || "Chưa gán"
      ).trim();
      updates.assignedStaff = staffLabel;
      updates.staffName = staffLabel;
      if (matchedStaff) {
        updates.staffId = matchedStaff.id;
        updates.staffCode = matchedStaff.code;
      }
    }

    if (body.purchasedProducts !== undefined) {
      const list = Array.isArray(body.purchasedProducts)
        ? body.purchasedProducts
        : String(body.purchasedProducts || "")
            .split(",")
            .map((p) => p.trim());
      updates.purchasedProducts = Array.from(new Set(list.filter(Boolean)));
    }

    if (body.tags !== undefined) {
      const tags = Array.isArray(body.tags)
        ? Array.from(new Set(body.tags.map((t) => String(t || "").trim()).filter(Boolean)))
        : [];
      updates.tags = tags;
    }

    if (body.pathology !== undefined) updates.pathology = String(body.pathology || "").trim();
    if (body.notes !== undefined) updates.notes = String(body.notes || "").trim();
    if (body.purchaseLevel !== undefined) updates.purchaseLevel = String(body.purchaseLevel || "").trim();

    const updated = updateCustomer(id, updates);
    if (!updated) {
      return Response.json(
        { ok: false, error: "Không tìm thấy khách hàng để cập nhật" },
        { status: 404 }
      );
    }

    // Đồng bộ thẻ tag sang conversation_tags.json theo SĐT chuẩn & zaloThreadId
    if (updates.tags !== undefined) {
      const oldPhone = normalizePhone(existing.phone);
      const newPhone = normalizePhone(updated.phone);
      if (oldPhone && newPhone && oldPhone !== newPhone) {
        removeConversationTags(oldPhone);
      }
      if (newPhone) {
        updateConversationTags(newPhone, updates.tags);
      }
      if (updated.zaloThreadId) {
        updateConversationTags(String(updated.zaloThreadId), updates.tags);
      }
    }

    return Response.json({
      ok: true,
      customer: updated,
      message: "Cập nhật hồ sơ khách hàng thành công",
    });
  } catch (error) {
    console.error("PUT /api/customers/[id] error:", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const currentStaff = await getSessionStaff(request);
    if (!currentStaff) {
      return Response.json(
        { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const existing = getCustomerById(id);
    if (!existing) {
      return Response.json(
        { ok: false, error: "Không tìm thấy khách hàng để xóa" },
        { status: 404 }
      );
    }

    if (!canAccessCustomerRecord(currentStaff, existing)) {
      return Response.json(
        { ok: false, error: "Từ chối quyền xóa: Bạn không phụ trách khách hàng này." },
        { status: 403 }
      );
    }

    const removed = deleteCustomer(id);
    if (!removed) {
      return Response.json(
        { ok: false, error: "Không thể xóa khách hàng khỏi cơ sở dữ liệu." },
        { status: 404 }
      );
    }

    const cleanPhone = normalizePhone(removed.phone);
    if (cleanPhone) removeConversationTags(cleanPhone);
    if (removed.zaloThreadId) removeConversationTags(String(removed.zaloThreadId));

    return Response.json({
      ok: true,
      deletedId: removed.id,
      message: `Đã xóa khách hàng "${removed.fullName || cleanPhone || id}" thành công.`,
    });
  } catch (error) {
    console.error("DELETE /api/customers/[id] error:", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
