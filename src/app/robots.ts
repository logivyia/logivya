import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/dashboard/", "/settings/", "/login", "/register", "/reset-password/"],
    }],
    sitemap: "https://www.logivya.com/sitemap.xml",
    host: "https://www.logivya.com",
  };
}
