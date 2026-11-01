(function () {
  "use strict";

  // Store only a SHA-256 fingerprint and request UUID, never customer details.
  // Keep the UUID after a network/response failure so a retry cannot create
  // another database order for the exact same request.
  const RETRY_KEY = "jplus_shop_v3_pending_order_request";

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

  async function fingerprintOrder(payload) {
    if (!crypto.subtle || typeof crypto.subtle.digest !== "function") {
      throw new Error("เบราว์เซอร์ไม่รองรับการตรวจสอบคำสั่งซื้ออย่างปลอดภัย กรุณาเปิดร้านผ่าน HTTPS");
    }
    const canonical = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(canonical);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }

  function getRequestId(fingerprint) {
    let stored;
    try {
      const raw = localStorage.getItem(RETRY_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch (_) {
      throw new Error("ไม่สามารถอ่านข้อมูลคำสั่งซื้อค้างส่งได้ กรุณาตรวจสอบการตั้งค่าพื้นที่จัดเก็บของเบราว์เซอร์");
    }

    if (stored && stored.fingerprint === fingerprint &&
        typeof stored.requestId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored.requestId)) {
      return stored.requestId;
    }

    const requestId = crypto.randomUUID();
    try {
      localStorage.setItem(RETRY_KEY, JSON.stringify({ fingerprint, requestId }));
    } catch (_) {
      // Do not send an order that cannot reuse its request UUID on retry.
      throw new Error("ไม่สามารถบันทึกรหัสป้องกันออเดอร์ซ้ำได้ กรุณาอนุญาตการจัดเก็บข้อมูลเว็บไซต์ก่อนสั่งซื้อ");
    }
    return requestId;
  }

  function clearRequestId(fingerprint, requestId) {
    try {
      const raw = localStorage.getItem(RETRY_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored && stored.fingerprint === fingerprint && stored.requestId === requestId) {
        localStorage.removeItem(RETRY_KEY);
      }
    } catch (_) {
      // The confirmed order has already been returned by Supabase.
    }
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

    const payload = {
      p_customer_name: String(order.customerName || "").trim(),
      p_customer_phone: String(order.customerPhone || "").trim(),
      p_delivery_method: method,
      p_delivery_address: String(order.deliveryAddress || "").trim(),
      p_items: items,
      p_delivery_area_id: areaId
    };

    // A retry of identical details reuses the UUID even after page reload.
    // A changed cart/customer/delivery request receives a new UUID.
    const fingerprint = await fingerprintOrder(payload);
    const requestId = getRequestId(fingerprint);

    const response = await fetch(
      `${url}/rest/v1/rpc/create_shop_order_v3`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_request_id: requestId, ...payload })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "ไม่สามารถบันทึกคำสั่งซื้อได้");
    }

    if (!Array.isArray(result) || !result.length) {
      throw new Error("ไม่ได้รับข้อมูลยืนยันคำสั่งซื้อ");
    }

    // Clear only after a confirmed Supabase response. On all uncertain errors,
    // the saved UUID remains for the next attempt.
    clearRequestId(fingerprint, requestId);
    return result[0];
  }

  window.JPLUS_ORDERS_API = { createOrder };
})();
