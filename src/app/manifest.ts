import type { MetadataRoute } from "next";
import { PRODUCT_CONTENT } from "@/config/product-content";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Logivya",
    short_name: "Logivya",
    description: PRODUCT_CONTENT.tr.store.shortDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#0B1020",
    theme_color: "#0B1020",
    icons: [
      {
        src: "/android-chrome-192x192.png?v=5",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png?v=5",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png?v=5",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
