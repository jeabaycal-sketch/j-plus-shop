
(function () {
  "use strict";

  function getConfig() {
    const config = window.JPLUS_SUPABASE_CONFIG;
    if (!config) {
      throw new Error("ไม่พบการตั้งค่า Supabase");
    }

    const url = config.url || config.supabaseUrl;
    const key = config.publishableKey || config.anonKey;

    if (!url || !key) {
      throw new Error("ข้อมูลเชื่อมต่อ Supabase ไม่ครบ");
    }

    return { url: url.replace(/\/$/, ""), key };
  }

  async function createOrder(order) {
    const { url, key } = getConfig();

    const items = order.items.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity)
    }));

    if (!items.length || items.some(
      (item) =>
        !Number.isSafeInteger(item.product_id) ||
        item.product_id <= 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
    )) {
      throw new Error("รายการสินค้าไม่ถูกต้อง");
    }

    const method = order.deliveryMethod;

    if (!["pickup", "local", "parcel"].includes(method)) {
      throw new Error("กรุณาเลือกวิธีรับสินค้า");
    }

    const areaId = method === "local"
      ? Number(order.deliveryAreaId)
      : null;

    if (method === "local" &&
        (!Number.isSafeInteger(areaId) || areaId <= 0)) {
      throw new Error("กรุณาเลือกพื้นที่จัดส่ง");
    }

    const requestId = crypto.randomUUID();

    const response = await fetch(
      `${url}/rest/v1/rpc/create_shop_order_v3`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_request_id: requestId,
          p_customer_name: String(order.customerName || "").trim(),
          p_customer_phone: String(order.customerPhone || "").trim(),
          p_delivery_method: method,
          p_delivery_address: String(order.deliveryAddress || "").trim(),
          p_items: items,
          p_delivery_area_id: areaId
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "ไม่สามารถบันทึกคำสั่งซื้อได้");
    }

    if (!Array.isArray(result) || !result.length) {
      throw new Error("ไม่ได้รับข้อมูลยืนยันคำสั่งซื้อ");
    }

    return result[0];
  }

  window.JPLUS_ORDERS_API = { createOrder };
})();
-
