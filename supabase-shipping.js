
/* J Plus Shop V3 - Shipping Settings */

window.JPlusShipping = {
  async load() {
    const config = window.JPLUS_SUPABASE_CONFIG;
    if (!config) {
      throw new Error("ไม่พบการตั้งค่า Supabase");
    }

    const baseUrl = config.url || config.supabaseUrl;
    const apiKey = config.publishableKey || config.anonKey;

    if (!baseUrl || !apiKey) {
      throw new Error("ข้อมูลเชื่อมต่อ Supabase ไม่ครบ");
    }

    const headers = {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`
    };

    const [settingsResponse, areasResponse] = await Promise.all([
      fetch(
        `${baseUrl}/rest/v1/shop_settings?select=setting_key,setting_value`,
        { headers }
      ),
      fetch(
        `${baseUrl}/rest/v1/shop_delivery_areas?select=id,area_name,delivery_fee,is_enabled&is_enabled=eq.true&order=id.asc`,
        { headers }
      )
    ]);

    if (!settingsResponse.ok || !areasResponse.ok) {
      throw new Error("ไม่สามารถโหลดข้อมูลค่าจัดส่งได้");
    }

    const settingsRows = await settingsResponse.json();
    const areas = await areasResponse.json();

    const settings = Object.fromEntries(
      settingsRows.map(row => [
        row.setting_key,
        Number(row.setting_value)
      ])
    );

    return {
      pickupEnabled: settings.pickup_enabled === 1,
      localDeliveryEnabled: settings.local_delivery_enabled === 1,
      parcelEnabled: settings.parcel_enabled === 1,
      parcelFee: settings.parcel_fee ?? 40,
      areas: areas.map(area => ({
        id: area.id,
        name: area.area_name,
        fee: Number(area.delivery_fee)
      }))
    };
  }
};
