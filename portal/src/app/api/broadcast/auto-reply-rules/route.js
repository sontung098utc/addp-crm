import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import fs from "fs";
import path from "path";
import { guardApiRequest } from "@/lib/rbac.js";

export const dynamic = "force-dynamic";

const RULES_PATH = path.join(process.cwd(), "config", "auto_reply_rules.json");

function getAutoReplyRules() {
  if (fs.existsSync(RULES_PATH)) {
    try {
      const raw = fs.readFileSync(RULES_PATH, "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    } catch {}
  }

  // Mẫu quy tắc từ khóa mặc định chuyên ngành Dược phẩm
  const defaultRules = [
    {
      id: "rule_glucare_price",
      name: "Tư vấn Giá Sữa Hạt Glucare Plus",
      keywords: ["giá", "bao nhiêu", "giá bao nhiêu", "nhiêu tiền", "bao tiền"],
      matchType: "CONTAINS",
      channels: ["ALL"],
      replyText: "Dạ chào {fullName}! Sữa hạt Glucare Plus chuyên biệt cho người tiểu đường & tiền tiểu đường hiện đang có chương trình dùng thử chỉ 9.000đ/gói hoặc hộp lon 400g/900g ưu đãi kèm quà tặng. Mình đang quan tâm dòng hộp lon hay gói tiện lợi để em báo giá chi tiết và gửi thực đơn dinh dưỡng cho mình ạ?",
      delaySeconds: 5,
      enabled: true,
      triggerCount: 142,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "rule_usage_consult",
      name: "Hướng dẫn Cách Dùng & Liều Dùng",
      keywords: ["cách dùng", "uống như nào", "uống lúc nào", "liều lượng", "hướng dẫn dùng"],
      matchType: "CONTAINS",
      channels: ["ALL"],
      replyText: "Dạ {fullName} ơi, tốt nhất mình nên uống 1 cốc nước ấm vào buổi sáng ngủ dậy, sau đó pha 3 muỗng gạt sữa hạt Glucare Plus với 150ml nước ấm (50-60 độ C) dùng thay thế bữa sáng hoặc bữa phụ lúc 15h chiều ạ. Bác sĩ nhà em dặn dùng đều đặn 2 ly/ngày sẽ giúp ổn định đường huyết rất êm bụng. Hiện tại chỉ số đường huyết lúc đói của mình đang là bao nhiêu ạ?",
      delaySeconds: 8,
      enabled: true,
      triggerCount: 89,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "rule_order_check",
      name: "Tra Cứu Đơn Hàng & Vận Đơn SPX",
      keywords: ["đơn hàng", "khi nào giao", "mã vận đơn", "giao chưa", "gửi chưa"],
      matchType: "CONTAINS",
      channels: ["ALL"],
      replyText: "Dạ {fullName}, em đã tiếp nhận yêu cầu kiểm tra đơn của mình. Chuyên viên chăm sóc {assignedStaff} đang đối soát ngay mã vận đơn để gửi lộ trình giao hàng trực tiếp qua Zalo cho mình trong ít phút nữa ạ. Mình cho em xin số điện thoại đặt hàng để em tra cứu nhanh nhất nhé?",
      delaySeconds: 5,
      enabled: true,
      triggerCount: 65,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  saveAutoReplyRules(defaultRules);
  return defaultRules;
}

function saveAutoReplyRules(rules) {
  try {
    const dir = path.dirname(RULES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("[SAVE_AUTO_REPLY_RULES_ERR]", err);
    return false;
  }
}

export async function GET() {
  const rules = getAutoReplyRules();
  return NextResponse.json({ ok: true, rules });
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "broadcast",
    });
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, keywords, matchType, channels, replyText, delaySeconds, enabled } = body;

    if (!name || !replyText) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập tên quy tắc và nội dung câu trả lời tự động." },
        { status: 400 }
      );
    }

    const rules = getAutoReplyRules();
    const cleanKeywords = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim()).filter(Boolean)
      : String(keywords || "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);

    if (cleanKeywords.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập ít nhất 1 từ khóa kích hoạt." },
        { status: 400 }
      );
    }

    const newRule = {
      id: `rule_${Date.now()}`,
      name: String(name).trim(),
      keywords: cleanKeywords,
      matchType: matchType || "CONTAINS",
      channels: Array.isArray(channels) && channels.length > 0 ? channels : ["ALL"],
      replyText: String(replyText).trim(),
      delaySeconds: Math.max(2, Math.min(60, Number(delaySeconds) || 5)),
      enabled: enabled !== false,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    rules.unshift(newRule);
    saveAutoReplyRules(rules);

    return NextResponse.json({ ok: true, rule: newRule, rules });
  } catch (err) {
    console.error("[AUTO_REPLY_POST_ERR]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "broadcast",
    });
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { id, name, keywords, matchType, channels, replyText, delaySeconds, enabled } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Thiếu ID quy tắc cần cập nhật." }, { status: 400 });
    }

    const rules = getAutoReplyRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy quy tắc từ khóa." }, { status: 404 });
    }

    const cleanKeywords = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim()).filter(Boolean)
      : keywords !== undefined
      ? String(keywords)
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : rules[idx].keywords;

    rules[idx] = {
      ...rules[idx],
      ...(name ? { name: String(name).trim() } : {}),
      keywords: cleanKeywords,
      ...(matchType ? { matchType } : {}),
      ...(channels ? { channels } : {}),
      ...(replyText !== undefined ? { replyText: String(replyText).trim() } : {}),
      ...(delaySeconds !== undefined ? { delaySeconds: Math.max(2, Math.min(60, Number(delaySeconds) || 5)) } : {}),
      ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
      updatedAt: new Date().toISOString(),
    };

    saveAutoReplyRules(rules);
    return NextResponse.json({ ok: true, rule: rules[idx], rules });
  } catch (err) {
    console.error("[AUTO_REPLY_PUT_ERR]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
      moduleKey: "broadcast",
    });
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Thiếu ID quy tắc cần xóa." }, { status: 400 });
    }

    let rules = getAutoReplyRules();
    rules = rules.filter((r) => r.id !== id);
    saveAutoReplyRules(rules);

    return NextResponse.json({ ok: true, rules });
  } catch (err) {
    console.error("[AUTO_REPLY_DELETE_ERR]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
