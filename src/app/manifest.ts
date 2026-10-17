import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alumni Connect",
    short_name: "Alumni",
    description: "Ask your university's alumni.",
    start_url: "/feed",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2c6dd5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
