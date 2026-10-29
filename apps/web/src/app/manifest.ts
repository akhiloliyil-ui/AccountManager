import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GPA — Grocery Planner & Money Manager",
    short_name: "GPA",
    description: "Plan groceries and manage money across accounts and currencies.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f6f3",
    theme_color: "#f6f6f3",
    categories: ["finance", "food", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    // Long-press the home-screen icon for these.
    shortcuts: [
      { name: "Add transaction", short_name: "Add", url: "/transactions/new", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "This week's grocery list", short_name: "Grocery list", url: "/lists/current", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Import a bank statement", short_name: "Import", url: "/import", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
