import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { TailoredCv } from "@/lib/cv/tailor";

const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 54;
const INK = rgb(0.12, 0.13, 0.12);
const MUTED = rgb(0.38, 0.4, 0.38);
const ACCENT = rgb(0.2, 0.36, 0.27);

function encodable(font: PDFFont, text: string): string {
  let out = "";
  for (const char of text.replace(/\s+/g, " ")) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += char === "\u2011" || char === "\u2010" ? "-" : "";
    }
  }
  return out;
}

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = doc.addPage(PAGE);
    this.y = PAGE[1] - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage(PAGE);
      this.y = PAGE[1] - MARGIN;
    }
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    let current = "";
    for (const word of encodable(font, text).split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !current) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  text(text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; bullet?: boolean } = {}) {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.regular;
    const indent = options.indent ?? 0;
    const bulletIndent = options.bullet ? 11 : 0;
    const width = PAGE[0] - MARGIN * 2 - indent - bulletIndent;
    const lines = this.wrap(text, font, size, width);
    const lead = size * 1.35;
    lines.forEach((line, index) => {
      this.ensure(lead);
      if (options.bullet && index === 0) {
        this.page.drawText("•", { x: MARGIN + indent, y: this.y - size, size, font: this.regular, color: options.color ?? INK });
      }
      this.page.drawText(line, { x: MARGIN + indent + bulletIndent, y: this.y - size, size, font, color: options.color ?? INK });
      this.y -= lead;
    });
    this.y -= options.gap ?? 0;
  }

  heading(text: string) {
    this.ensure(30);
    this.y -= 8;
    this.text(text.toUpperCase(), { size: 10.5, bold: true, color: ACCENT });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 1 },
      end: { x: PAGE[0] - MARGIN, y: this.y + 1 },
      thickness: 0.6,
      color: ACCENT,
    });
    this.y -= 6;
  }
}

export async function renderCvPdf(cv: TailoredCv, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("Jobinator");
  doc.setProducer("Jobinator");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, regular, bold);

  if (cv.name) writer.text(cv.name, { size: 20, bold: true, gap: 2 });
  if (cv.contact.length > 0) writer.text(cv.contact.join("   ·   "), { size: 9.5, color: MUTED, gap: 4 });

  for (const section of cv.sections) {
    writer.heading(section.heading);
    if (section.kind === "summary") {
      writer.text(section.items.join(" "), { gap: 2 });
    } else if (section.kind === "skills" || section.kind === "languages") {
      writer.text(section.items.join("   ·   "), { gap: 2 });
    } else {
      for (const item of section.items) writer.text(item, { bullet: section.kind === "education", gap: 1 });
    }
    for (const entry of section.entries) {
      entry.header.forEach((line, index) => writer.text(line, { bold: index === 0, color: index === 0 ? INK : MUTED, size: index === 0 ? 10.5 : 9.5 }));
      for (const bullet of entry.bullets) writer.text(bullet, { bullet: true, indent: 4, gap: 1 });
      writer.text("", { size: 4 });
    }
  }
  return doc.save();
}
