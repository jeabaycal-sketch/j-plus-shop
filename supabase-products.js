
window.JPLUS_PRODUCTS_API = {
  async getProducts() {
    const config = window.JPLUS_SUPABASE_CONFIG;

    if (!config?.url || !config?.publishableKey) {
      throw new Error("ยังไม่พบการตั้งค่า Supabase");
    }

    const response = await fetch(
      `${config.url}/rest/v1/products?select=id,name,price,cost,stock,sku&order=id.asc`,
      {
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${config.publishableKey}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Supabase error: ${response.status}`
      );
    }

    return await response.json();
  }
};
