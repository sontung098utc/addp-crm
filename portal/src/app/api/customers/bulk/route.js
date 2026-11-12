import { getSessionStaff } from "../../../../lib/auth.js";
import { filterRecordsByRbac } from "../../../../lib/rbac.js";
import {
  getAllCustomers,
  bulkDeleteCustomersByIds,
  bulkAddTagToCustomersByIds,
  normalizePhone,
} from "../../../../lib/customerIdentityResolver.js";
import {
  getTags,
  addTag,
  bulkAddConversationTag,
  bulkRemoveConversationTags,
} from "../../../../lib/tagStore.js";

export const dynamic = "force-dynamic";

function collectCustomerConversationKeys(customer = {}) {
  const keys = [];
  const normPhone = normalizePhone(customer.phone || "");
  if (normPhone) keys.push(normPhone);
  if (customer.zaloUid) keys.push(String(customer.zaloUid).trim());
  if (customer.zaloThreadId) keys.push(String(customer.zaloThreadId).trim());
  return Array.from(new Set(keys.filter(Boolean)));
}

/**
 * POST /api/customers/bulk
 * Xử lý tác vụ hàng loạt trên danh sách Khách hàng:
 * - { action: "delete", customerIds: [...] }
 * - { action: "add_tag", customerIds: [...], tagId: "tag_vip", tagName?: "..." }
 */
export async function POST(request) {
  try {
    const currentStaff = await getSessionStaff(request);
    if (!currentStaff) {
      return Response.json(
        { ok: false, success: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const action = String(body?.action || "").trim();
    const rawIds = Array.isArray(body?.customerIds) ? body.customerIds : [];
    const requestedIdSet = new Set(
      rawIds.map((id) => String(id || "").trim()).filter(Boolean)
    );

    if (requestedIdSet.size === 0) {
      return Response.json(
        { ok: false, success: false, error: "Vui lòng chọn ít nhất 1 khách hàng." },
        { status: 400 }
      );
    }

    const allCustomers = getAllCustomers();
    const matchedCustomers = allCustomers.filter(
      (c) =>
        (c.id !== undefined && c.id !== null && requestedIdSet.has(String(c.id).trim())) ||
        (c.code && requestedIdSet.has(String(c.code).trim()))
    );

    if (matchedCustomers.length === 0) {
      return Response.json(
        { ok: false, success: false, error: "Không tìm thấy khách hàng phù hợp để xử lý." },
        { status: 404 }
      );
    }

    // Kiểm tra RBAC phạm vi dữ liệu: chỉ thao tác trên những khách thuộc quyền nhân viên hiện tại
    const authorizedCustomers = filterRecordsByRbac(currentStaff, matchedCustomers, "customers");
    if (authorizedCustomers.length === 0) {
      return Response.json(
        {
          ok: false,
          success: false,
          error: "Từ chối truy cập: Bạn không phụ trách các khách hàng đã chọn.",
        },
        { status: 403 }
      );
    }

    const authorizedIds = authorizedCustomers.map((c) => c.id ?? c.code);

    if (action === "delete") {
      const { removed, remaining } = bulkDeleteCustomersByIds(authorizedIds);

      // Thu thập tập khóa vẫn còn đang được khách hàng khác sử dụng để không xóa nhầm thẻ của khách còn lại
      const remainingKeySet = new Set();
      for (const rem of remaining) {
        for (const k of collectCustomerConversationKeys(rem)) {
          remainingKeySet.add(k);
        }
      }

      const keysToRemove = [];
      for (const delCust of removed) {
        for (const k of collectCustomerConversationKeys(delCust)) {
          if (!remainingKeySet.has(k)) {
            keysToRemove.push(k);
          }
        }
        if (delCust.id !== undefined && delCust.id !== null) {
          keysToRemove.push(String(delCust.id).trim());
        }
      }
      bulkRemoveConversationTags(keysToRemove);

      return Response.json({
        ok: true,
        success: true,
        action: "delete",
        count: removed.length,
        deletedIds: removed.map((c) => c.id),
        message: `Đã xóa thành công ${removed.length} khách hàng khỏi hệ thống.`,
      });
    }

    if (action === "add_tag") {
      const rawTagId = String(body?.tagId || "").trim();
      const rawTagName = String(body?.tagName || "").trim();
      const rawColor = String(body?.color || "blue").trim();

      if (!rawTagId && !rawTagName) {
        return Response.json(
          { ok: false, success: false, error: "Vui lòng chọn hoặc nhập tên thẻ tag cần gắn." },
          { status: 400 }
        );
      }

      const existingTags = getTags();
      let resolvedTagObj = existingTags.find(
        (t) =>
          (rawTagId && (String(t.id) === rawTagId || String(t.name) === rawTagId)) ||
          (rawTagName && String(t.name).toLowerCase() === rawTagName.toLowerCase())
      );

      // Nếu người dùng nhập thẻ mới chưa có trong tags.json -> tạo mới vào tags.json
      if (!resolvedTagObj && rawTagName) {
        resolvedTagObj = addTag({ name: rawTagName, color: rawColor });
      }

      const canonicalTag = resolvedTagObj?.name || rawTagName || rawTagId;
      const { updated } = bulkAddTagToCustomersByIds(authorizedIds, canonicalTag);

      // Đồng bộ thẻ tag vào conversation_tags.json theo SĐT chuẩn & zaloUid/zaloThreadId
      const convKeys = [];
      for (const cust of updated) {
        for (const k of collectCustomerConversationKeys(cust)) {
          convKeys.push(k);
        }
      }
      bulkAddConversationTag(convKeys, canonicalTag);

      return Response.json({
        ok: true,
        success: true,
        action: "add_tag",
        count: updated.length,
        tag: canonicalTag,
        tagId: resolvedTagObj?.id || rawTagId || canonicalTag,
        message: `Đã gắn thẻ "${canonicalTag}" cho ${updated.length} khách hàng.`,
      });
    }

    return Response.json(
      { ok: false, success: false, error: `Hành động không hợp lệ: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("[CUSTOMERS_BULK_ERROR]", error);
    return Response.json(
      { ok: false, success: false, error: error?.message || "Lỗi xử lý hàng loạt khách hàng." },
      { status: 500 }
    );
  }
}
