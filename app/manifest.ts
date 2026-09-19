import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prospect",
    short_name: "Prospect",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f6ee",
    theme_color: "#f9f6ee",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
