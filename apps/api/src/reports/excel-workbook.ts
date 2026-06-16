export type ScalarCellValue = string | number | boolean | null | undefined;

export interface FormulaCell {
  formula: string;
}

export type CellValue = ScalarCellValue | FormulaCell;

export interface WorkbookSheet {
  name: string;
  rows: CellValue[][];
}

export function buildWorkbookBuffer(sheets: WorkbookSheet[]): Buffer {
  const files: Array<{ path: string; content: string | Buffer }> = [
    { path: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
    { path: "_rels/.rels", content: rootRelsXml() },
    { path: "xl/workbook.xml", content: workbookXml(sheets) },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheets.length) },
    { path: "xl/styles.xml", content: stylesXml() },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet)
    }))
  ];
  return zipStored(files);
}

export function imagePreviewCell(imageUrl: string | null | undefined): FormulaCell | null {
  const url = String(imageUrl ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  return { formula: `IMAGE("${escapeFormulaString(url)}","product image")` };
}

function contentTypesXml(sheetCount: number): string {
  return xmlDecl(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      ${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
    </Types>`
  );
}

function rootRelsXml(): string {
  return xmlDecl(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`
  );
}

function workbookXml(sheets: WorkbookSheet[]): string {
  return xmlDecl(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>
        ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
      </sheets>
      <calcPr calcId="0" fullCalcOnLoad="1"/>
    </workbook>`
  );
}

function workbookRelsXml(sheetCount: number): string {
  return xmlDecl(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${Array.from(
        { length: sheetCount },
        (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      ).join("")}
      <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`
  );
}

function stylesXml(): string {
  return xmlDecl(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
      <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`
  );
}

function worksheetXml(sheet: WorkbookSheet): string {
  const maxCols = Math.max(1, ...sheet.rows.map((row) => row.length));
  const hasImagePreview = sheet.rows[0]?.some((cell) => cell === "Image Preview") ?? false;
  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => cellXml(value, `${columnName(colIndex + 1)}${rowIndex + 1}`, rowIndex === 0 || (sheet.name === "Summary" && rowIndex === 1)))
        .join("");
      const rowHeight = hasImagePreview && rowIndex > 0 ? ' ht="64" customHeight="1"' : "";
      return `<row r="${rowIndex + 1}"${rowHeight}>${cells}</row>`;
    })
    .join("");
  const columnsXml = Array.from(
    { length: maxCols },
    (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(sheet, index)}" customWidth="1"/>`
  ).join("");

  return xmlDecl(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
      <cols>${columnsXml}</cols>
      <sheetData>${rowsXml}</sheetData>
      <autoFilter ref="A1:${columnName(maxCols)}${Math.max(1, sheet.rows.length)}"/>
    </worksheet>`
  );
}

function cellXml(value: CellValue, ref: string, isHeader: boolean): string {
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${isHeader ? ' s="1"' : ""}/>`;
  }
  if (isFormulaCell(value)) {
    return `<c r="${ref}"${isHeader ? ' s="1"' : ""}><f>${escapeXml(value.formula)}</f></c>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${isHeader ? ' s="1"' : ""}><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}" t="b"${isHeader ? ' s="1"' : ""}><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${isHeader ? ' s="1"' : ""}><is><t>${escapeXml(String(value))}</t></is></c>`;
}

function columnWidth(sheet: WorkbookSheet, columnIndex: number): number {
  const header = String(sheet.rows[0]?.[columnIndex] ?? "");
  if (header === "Image Preview") {
    return 14;
  }
  if (/URL/i.test(header)) {
    return 36;
  }
  const values = sheet.rows.map((row) => String(row[columnIndex] ?? ""));
  const maxLength = Math.max(8, ...values.map((value) => Math.min(60, value.length)));
  return Math.min(42, Math.max(10, Math.ceil(maxLength * 1.2)));
}

function columnName(index: number): string {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function isFormulaCell(value: CellValue): value is FormulaCell {
  return typeof value === "object" && value !== null && "formula" in value;
}

function escapeFormulaString(value: string): string {
  return value.replace(/"/g, '""');
}

function xmlDecl(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value.replace(/>\s+</g, "><").trim()}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function zipStored(files: Array<{ path: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const filename = Buffer.from(file.path, "utf8");
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(filename.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, filename, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, filename);

    offset += local.length + filename.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
