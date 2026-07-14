import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Infinite Canvas Sample Status",
    short_name: "Sample Status",
    description: "Supplier sample-order progress updates and physical-sample approval.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#172554",
    icons: [{ src: "/sample-status-icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
