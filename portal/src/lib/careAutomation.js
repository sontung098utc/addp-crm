/**
 * ADDP Omnichannel AI CRM - Care Plan Automation Helper (WBS-03)
 * Kế thừa từ C:\QuanlyKH\src\lib\automation.js
 * Tự động tạo lộ trình chăm sóc sau mua hàng:
 * - DAY_1, DAY_3, DAY_7, DAY_14, DAY_21
 * - HALF_USAGE (Dùng được 1/2 liệu trình), TWO_THIRD_USAGE (Dùng được 2/3 liệu trình - nhắc tái mua)
 */

export const CARE_MILESTONES = [
  {
    type: "DAY_1",
    offsetDays: 1,
    title: "CS Ngày 1: Xác nhận nhận hàng & hướng dẫn sử dụng chuẩn",
    script:
      "Chào {fullName}, đơn hàng {productName} đã giao thành công. Em xin phép hướng dẫn anh/chị cách dùng đúng liều lượng để đạt hiệu quả tốt nhất ạ.",
  },
  {
    type: "DAY_3",
    offsetDays: 3,
    title: "CS Ngày 3: Kiểm tra cảm nhận ban đầu & thói quen uống",
    script:
      "Chào {fullName}, sau 3 ngày sử dụng {productName}, cơ thể mình có dễ chịu và ngủ ngon hơn không ạ? Anh/chị nhớ duy trì uống đúng giờ nhé!",
  },
  {
    type: "DAY_7",
    offsetDays: 7,
    title: "CS Ngày 7: Đo & ghi nhận chỉ số đường huyết tuần 1",
    script:
      "Chào {fullName}, tròn 1 tuần mình dùng {productName} rồi ạ. Sáng nay anh/chị đo đường huyết lúc đói được bao nhiêu mmol/L để em cập nhật vào hồ sơ theo dõi cho mình nhé!",
  },
  {
    type: "DAY_14",
    offsetDays: 14,
    title: "CS Ngày 14: Đánh giá cải thiện 2 tuần & tư vấn chế độ ăn",
    script:
      "Chào {fullName}, qua 2 tuần dùng {productName}, chỉ số đường huyết và tình trạng tiểu đêm/mệt mỏi của mình đã giảm rõ rệt chưa ạ?",
  },
  {
    type: "DAY_21",
    offsetDays: 21,
    title: "CS Ngày 21: Kiểm tra tuân thủ liệu trình 3 tuần",
    script:
      "Chào {fullName}, anh/chị đã đi được 3 tuần liệu trình {productName}. Giai đoạn này rất quan trọng để ổn định bền vững, mình cố gắng dùng đều đặn mỗi ngày nhé!",
  },
];

/**
 * Tính toán danh sách công việc chăm sóc (Tasks) tự động dựa trên ngày bắt đầu sử dụng và tổng số ngày liệu trình.
 * @param {object} params
 * @param {string} params.customerName - Tên khách hàng
 * @param {string} params.productName - Tên sản phẩm (VD: Sữa hạt Glucare Plus / ADDP Viên An Đường)
 * @param {Date|string} [params.startDate] - Ngày bắt đầu sử dụng (mặc định hôm nay)
 * @param {number} [params.durationDays] - Tổng số ngày sử dụng của đơn hàng (VD: 15, 30, 60 ngày)
 * @returns {Array<{type: string, title: string, dueDate: string, offsetDays: number, suggestedMessage: string}>}
 */
export function buildCareSchedule({
  customerName = "Anh/Chị",
  productName = "Sữa hạt tiểu đường Glucare Plus",
  startDate = new Date(),
  durationDays = 30,
} = {}) {
  const baseDate = new Date(startDate);
  const totalDays = Math.max(7, Number(durationDays) || 30);

  const addDays = (days) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const formatMsg = (tpl) =>
    tpl
      .replace(/\{fullName\}/g, customerName)
      .replace(/\{productName\}/g, productName);

  const tasks = CARE_MILESTONES.filter((m) => m.offsetDays <= totalDays).map((m) => ({
    type: m.type,
    title: `${m.title} — ${customerName}`,
    offsetDays: m.offsetDays,
    dueDate: addDays(m.offsetDays),
    suggestedMessage: formatMsg(m.script),
  }));

  const halfDay = Math.round(totalDays / 2);
  if (halfDay > 3 && !tasks.some((t) => t.offsetDays === halfDay)) {
    tasks.push({
      type: "HALF_USAGE",
      title: `CS Dùng 1/2 Liệu Trình (Ngày ${halfDay}) — ${customerName}`,
      offsetDays: halfDay,
      dueDate: addDays(halfDay),
      suggestedMessage: formatMsg(
        "Chào {fullName}, mình đã dùng được khoảng 1/2 liệu trình {productName}. Em nhắn hỏi thăm xem lượng sản phẩm còn lại có khớp với số ngày dùng không ạ?"
      ),
    });
  }

  const twoThirdDay = Math.round((totalDays * 2) / 3);
  if (twoThirdDay > 5) {
    tasks.push({
      type: "TWO_THIRD_USAGE",
      title: `CS Dùng 2/3 Liệu Trình & Nhắc Tái Mua (Ngày ${twoThirdDay}) — ${customerName}`,
      offsetDays: twoThirdDay,
      dueDate: addDays(twoThirdDay),
      suggestedMessage: formatMsg(
        "Chào {fullName}, liệu trình {productName} của mình đã dùng được 2/3 chặng đường rồi ạ. Để không bị ngắt quãng hiệu quả ổn định đường huyết, em hỗ trợ anh/chị đặt trước liệu trình tiếp theo kèm ưu đãi khách thân thiết nhé!"
      ),
    });
  }

  return tasks.sort((a, b) => a.offsetDays - b.offsetDays);
}
