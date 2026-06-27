import { inflateRawSync } from "node:zlib";

export const DAILY_REPORT_SHEET_NAMES = [
  "Summary",
  "Category Bestsellers",
  "Brand Matrix",
  "Category Signals",
  "Promo Price Signals",
  "Price Review History",
  "Activity Events",
  "Keyword Rankings",
  "Competitor Pool",
  "BSR History",
  "BSR Quality",
  "BSR Changes",
  "Action Insights",
  "Brand Top10 Changes",
  "Alert Log",
  "Insight Events",
  "Review Queue",
  "Brand Strategy Tags"
];

export function getWorkbookSheetNames(buffer: Buffer): string[] {
  const workbookXml = readZipText(buffer, "xl/workbook.xml");
  return Array.from(workbookXml.matchAll(/<sheet name="([^"]+)"/g), ([, name]) => decodeXml(name));
}

export function readZipText(buffer: Buffer, path: string): string {
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }
    if (signature !== 0x04034b50) {
      throw new Error(`Unsupported zip signature 0x${signature.toString(16)} at ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buffer.length) {
      throw new Error(`Zip entry ${path} is truncated`);
    }

    const fileName = buffer.subarray(fileNameStart, fileNameEnd).toString("utf8");
    if (fileName === path) {
      const content = buffer.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) {
        return content.toString("utf8");
      }
      if (compressionMethod === 8) {
        return inflateRawSync(content).toString("utf8");
      }
      throw new Error(`Unsupported compression method ${compressionMethod} for ${path}`);
    }

    offset = dataEnd;
  }

  throw new Error(`Zip entry not found: ${path}`);
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
