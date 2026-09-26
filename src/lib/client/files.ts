"use client";

/** Lê PDF, TXT ou MD direto no navegador: o arquivo nunca sobe para o servidor. */
export async function readStudyFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.size > 40 * 1024 * 1024) throw new Error("Arquivo grande demais (máximo de 40 MB).");

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    const joined = pages
      .map((page) => page.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!joined) throw new Error("Esse PDF não tem texto selecionável (pode ser uma imagem escaneada).");
    return joined;
  }
  if (/\.(txt|md|markdown|csv)$/.test(name) || file.type.startsWith("text/")) {
    return file.text();
  }
  throw new Error("Formato não suportado. Envie PDF, TXT ou MD.");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadJson(data: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "arquivo"
  );
}
