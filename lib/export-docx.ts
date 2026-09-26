import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from "docx";
import sharp from "sharp";

import type { CardVariant, PrintItem } from "@/lib/cards";
import { validateAndCacheCardImage } from "@/lib/card-image-service";
import { completeExportJob, updateExportJob } from "@/lib/export-store";

const CARD_WIDTH_MM = 59;
const CARD_HEIGHT_MM = 86;
const GAP_MM = 2;
const PAGE_MARGIN_MM = 10;
const CARDS_PER_PAGE = 9;
const IMAGE_WIDTH_PX = 697;
const IMAGE_HEIGHT_PX = 1016;
const COLUMN_WIDTHS = [CARD_WIDTH_MM, GAP_MM, CARD_WIDTH_MM, GAP_MM, CARD_WIDTH_MM]
  .map(convertMillimetersToTwip);
const TABLE_WIDTH = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

type PreparedImage = { data: Buffer; type: "jpg"; warnings: string[] };

function pixels(millimeters: number) {
  return millimeters * 96 / 25.4;
}

async function prepareImage(id: string, cid: number, variant: PrintItem["variant"]): Promise<PreparedImage> {
  const validated = await validateAndCacheCardImage(id, cid, variant);
  const data = await sharp(validated.data)
    .resize(IMAGE_WIDTH_PX, IMAGE_HEIGHT_PX, { fit: "fill" })
    .jpeg({ quality: 93, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
  return { data, type: "jpg", warnings: validated.warnings };
}

function emptyParagraph() {
  return new Paragraph({ spacing: { before: 0, after: 0 } });
}

function cell(width: number, image?: PreparedImage, name?: string) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [image ? new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({
        type: image.type,
        data: image.data,
        transformation: { width: pixels(CARD_WIDTH_MM), height: pixels(CARD_HEIGHT_MM) },
        altText: { title: name ?? "卡图", description: name ?? "卡图", name: name ?? "卡图" },
      })],
    }) : emptyParagraph()],
  });
}

function cardRow(items: PrintItem[], images: PreparedImage[], row: number) {
  const children: TableCell[] = [];
  for (let column = 0; column < 3; column += 1) {
    const index = row * 3 + column;
    const item = items[index];
    children.push(cell(COLUMN_WIDTHS[column * 2], images[index], item?.card.name));
    if (column < 2) children.push(cell(COLUMN_WIDTHS[column * 2 + 1]));
  }
  return new TableRow({
    cantSplit: true,
    height: { value: convertMillimetersToTwip(CARD_HEIGHT_MM), rule: HeightRule.EXACT },
    children,
  });
}

function gapRow() {
  return new TableRow({
    cantSplit: true,
    height: { value: convertMillimetersToTwip(GAP_MM), rule: HeightRule.EXACT },
    children: [new TableCell({ columnSpan: 5, children: [emptyParagraph()] })],
  });
}

function pageTable(items: PrintItem[], images: PreparedImage[]) {
  const rows: TableRow[] = [];
  for (let row = 0; row < 3; row += 1) {
    rows.push(cardRow(items, images, row));
    if (row < 2) rows.push(gapRow());
  }
  return new Table({
    rows,
    columnWidths: COLUMN_WIDTHS,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: {
      top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
      insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
    },
  });
}

export async function generateExportDocument(jobId: string, items: PrintItem[]) {
  try {
    await updateExportJob(jobId, { status: "processing" });
    const expanded = items.flatMap((item) => Array.from({ length: item.quantity }, () => item));
    const unique = new Map<string, { id: string; cid: number; variant: CardVariant }>();
    for (const item of expanded) {
      const key = item.card.id + ":" + item.variant;
      unique.set(key, { id: item.card.id, cid: item.card.cid, variant: item.variant });
    }

    const prepared = new Map<string, PreparedImage>();
    const warnings = new Set<string>();
    const entries = [...unique.entries()];
    for (let offset = 0; offset < entries.length; offset += 4) {
      const batch = entries.slice(offset, offset + 4);
      const results = await Promise.all(batch.map(async ([key, source]) =>
        [key, await prepareImage(source.id, source.cid, source.variant)] as const));
      for (const [key, image] of results) {
        prepared.set(key, image);
        image.warnings.forEach((warning) => warnings.add(warning));
      }
    }

    const sections = [];
    for (let offset = 0; offset < expanded.length; offset += CARDS_PER_PAGE) {
      const pageItems = expanded.slice(offset, offset + CARDS_PER_PAGE);
      const pageImages = pageItems.map((item) => prepared.get(item.card.id + ":" + item.variant)!);
      sections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: {
              top: convertMillimetersToTwip(PAGE_MARGIN_MM),
              right: convertMillimetersToTwip(PAGE_MARGIN_MM),
              bottom: convertMillimetersToTwip(PAGE_MARGIN_MM),
              left: convertMillimetersToTwip(PAGE_MARGIN_MM),
            },
          },
        },
        children: [pageTable(pageItems, pageImages)],
      });
    }

    const document = new Document({
      creator: "YGO CardPrint",
      title: "YGO CardPrint 打印文件",
      description: "A4 纵向 3×3 游戏王实体卡打印文件",
      sections,
    });
    const file = await Packer.toBuffer(document);
    const fileName = "ygo-cardprint-" + new Date().toISOString().slice(0, 10) + ".docx";
    await completeExportJob(jobId, file, fileName, [...warnings]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成 Word 文件失败";
    await updateExportJob(jobId, { status: "failed", error: message }).catch(console.error);
  }
}
