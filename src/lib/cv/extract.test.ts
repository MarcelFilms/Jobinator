import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractCvText } from "@/lib/cv/extract";

describe("CV text extraction", () => {
  it("reads a plain text file", async () => {
    const text = await extractCvText("customer-support.txt", new TextEncoder().encode("Customer support and customer-facing experience."));
    expect(text).toBe("Customer support and customer-facing experience.");
  });

  it("reads a docx file", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    );
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>Running Arbonomics, a subscription-based software business.</w:t></w:r></w:p></w:body>
      </w:document>`,
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const text = await extractCvText("general.docx", bytes);
    expect(text).toContain("Running Arbonomics");
  });

  it("rejects an unknown file type", async () => {
    await expect(extractCvText("notes.rtf", new TextEncoder().encode("hello"))).rejects.toThrow(/PDF, DOCX, or TXT/);
  });
});
