import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

router.get("/store/settings", async (req, res): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      res.json({
        storeName: "YA Commerce",
        logoUrl: null,
        supportEmail: "support@yacommerce.com",
        supportPhone: null,
        codEnabled: true,
        freeShippingAbove: 499,
        returnWindowDays: 7,
        currency: "INR",
      });
      return;
    }

    res.json({
      storeName: data.store_name,
      logoUrl: data.logo_url,
      supportEmail: data.support_email,
      supportPhone: data.support_phone,
      codEnabled: data.cod_enabled,
      freeShippingAbove: data.free_shipping_above,
      returnWindowDays: data.return_window_days,
      currency: data.default_currency,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch store settings");
    res.json({
      storeName: "YA Commerce",
      currency: "INR",
      codEnabled: true,
      freeShippingAbove: 499,
      returnWindowDays: 7,
    });
  }
});

export default router;
