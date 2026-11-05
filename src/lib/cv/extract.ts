export async function extractCvText(filename: string, bytes: Uint8Array): Promise<string> {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  let text = "";
  if (extension === "txt" || extension === "md" || extension === "text") {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } else if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = result.value;
  } else if (extension === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    text = Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text ?? "");
  } else {
    throw new Error("Upload a PDF, DOCX, or TXT file.");
  }
  const cleaned = text.replace(/\u0000/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) throw new Error("No text could be read from that file.");
  return cleaned.slice(0, 100_000);
}
