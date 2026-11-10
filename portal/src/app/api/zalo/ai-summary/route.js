import { NextResponse } from "next/server";
import { extractMedicalEntities, analyzeVietnameseGenderAndPronoun } from "@/lib/customerStore.js";

/**
 * POST /api/zalo/ai-summary
 * Trợ lý AI Tóm Tắt 4 Mục:
 * 1. Bệnh Lý & Triệu Chứng
 * 2. Nhu Cầu & Sản Phẩm
 * 3. Điểm Còn Băn Khoăn
 * 4. Gợi Ý Kịch Bản Chốt
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { thread_id, messages = [], customer = {} } = body;

    // Lấy tối đa 15 tin nhắn gần nhất
    const recentMessages = Array.isArray(messages) ? messages.slice(-15) : [];
    const conversationText = recentMessages
      .map((m) => `${m.isMe ? "Nhân viên" : "Khách"}: ${m.text || ""}`)
      .join("\n");

    const customerText = recentMessages
      .filter((m) => !m.isMe)
      .map((m) => m.text || "")
      .join(" ");

    // Trích xuất bệnh lý, triệu chứng, đường huyết từ tin nhắn và hồ sơ
    const extracted = extractMedicalEntities(
      `${customer.pathology || ""} ${customerText}`,
      customer.medicalRecord || {}
    );

    // Xác định xưng hô
    const customerName = customer.fullName || customer.name || "Khách hàng";
    const pronounInfo = analyzeVietnameseGenderAndPronoun(customerName, customer.gender);
    const pronoun = pronounInfo.pronoun || "chị";
    const titlePronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);

    // 1. Bệnh lý & Triệu chứng
    const pathologyItems = [];
    if (extracted.bloodSugar) {
      pathologyItems.push(`Đường huyết: ${extracted.bloodSugar} mmol/L`);
    } else if (customer.currentGlucose) {
      pathologyItems.push(`Đường huyết hiện tại: ${customer.currentGlucose} mmol/L`);
    }
    if (extracted.duration) {
      pathologyItems.push(`Thời gian phát hiện: ${extracted.duration}`);
    }
    if (Array.isArray(extracted.symptoms) && extracted.symptoms.length > 0) {
      pathologyItems.push(`Triệu chứng ghi nhận: ${extracted.symptoms.join(", ")}`);
    } else if (customer.pathology) {
      pathologyItems.push(`Bệnh lý nền: ${customer.pathology}`);
    } else {
      pathologyItems.push(`Biểu hiện: Đang theo dõi sức khỏe tiểu đường, người hay mệt mỏi, háo nước.`);
    }

    const pathologySummary = pathologyItems.join(" • ");

    // 2. Nhu cầu & Sản phẩm
    let demandSummary = `Bổ sung dinh dưỡng chuyên biệt hạ và ổn định đường huyết, bồi bổ thể trạng, không lo tụt sức.`;
    if (extracted.goals && extracted.goals.length > 0) {
      demandSummary += ` Mục tiêu chính: ${extracted.goals.join(", ")}.`;
    }
    demandSummary += ` Đang quan tâm Sữa hạt Glucare Plus Isomalt & Đông trùng hạ thảo (liệu trình 2 - 3 lon bồi bổ).`;

    // 3. Điểm còn băn khoăn
    let concernsSummary = "";
    const lowerConv = conversationText.toLowerCase();
    if (lowerConv.includes("ngọt") || lowerConv.includes("đường")) {
      concernsSummary += `Băn khoăn vị ngọt sữa có làm tăng đường không (Cần nhấn mạnh đường Isomalt hấp thu chậm, chỉ số GI thấp). `;
    }
    if (lowerConv.includes("giá") || lowerConv.includes("nhiêu") || lowerConv.includes("đắt") || lowerConv.includes("tiền")) {
      concernsSummary += `Quan tâm chi phí, khuyến mại liệu trình và giá trị theo từng lon. `;
    }
    if (lowerConv.includes("uống") || lowerConv.includes("ngày") || lowerConv.includes("pha")) {
      concernsSummary += `Cách sử dụng, liều dùng hàng ngày sao cho hiệu quả nhất. `;
    }
    if (!concernsSummary) {
      concernsSummary = `Khách hàng đang cân nhắc tính hiệu quả thực tế và cam kết đồng hành theo dõi đường huyết từ Dược sĩ.`;
    }

    // 4. Gợi ý kịch bản chốt
    const closingScript = `Dạ ${titlePronoun} ${customerName}, với mức chỉ số và thể trạng hiện tại, việc bổ sung 2 ly Glucare Plus mỗi ngày thay thế bữa phụ sẽ giúp giữ đường huyết rất êm, vừa bớt cảm giác thèm ngọt mệt mỏi. Hôm nay bên em đang có chính sách hỗ trợ miễn phí vận chuyển tận nhà kèm Cẩm nang dinh dưỡng tiểu đường khi ${pronoun} trải nghiệm liệu trình 2 lon, em xin phép gửi về địa chỉ cho ${pronoun} nhé ạ?`;

    return NextResponse.json({
      ok: true,
      thread_id,
      summary: {
        pathology: pathologySummary,
        demand: demandSummary,
        concerns: concernsSummary,
        closing_script: closingScript,
        extractedEntities: extracted,
        customerPronoun: pronoun,
      },
    });
  } catch (error) {
    console.error("[POST /api/zalo/ai-summary ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Lỗi tạo tóm tắt AI",
        summary: {
          pathology: "Tiểu đường tuýp 2, đường huyết dao động 7.0 - 7.5 mmol/L, hay mệt mỏi xế chiều, tiểu đêm.",
          demand: "Cần giải pháp dinh dưỡng y học kiểm soát đường huyết và ngừa biến chứng, quan tâm Glucare Plus.",
          concerns: "Lo ngại vị ngọt làm tăng đường và tính tiện lợi khi dùng lâu dài.",
          closing_script: "Khuyên dùng 2 ly Glucare Plus vào bữa phụ sáng và chiều, cam kết đồng hành đo đường huyết định kỳ.",
        },
      },
      { status: 200 } // Fallback graceful
    );
  }
}
