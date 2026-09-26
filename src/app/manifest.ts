import type { MetadataRoute } from "next";

/**
 * Manifesto do app instalável (PWA). O share_target coloca o Anki Studio na
 * lista do "Compartilhar" do Android: texto, link ou PDF vão direto para a
 * captura rápida da tela Início.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anki Studio",
    short_name: "Anki Studio",
    description: "Flashcards com IA do seu jeito, direto para o Anki.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#4f46e5",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/compartilhar",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "file", accept: ["application/pdf", "text/plain", "text/markdown", ".pdf", ".txt", ".md"] }],
      },
    },
  };
}
