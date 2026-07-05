// Minimal in-browser ZIP writer (store method, no compression) — no dependency
// needed for "download these text files as one archive". Shared by any
// export-all-as-zip action (context files, developer packs, ...).

let crcTable: Uint32Array | null = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}
function crc32(bytes: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function writeU16(target: number[], value: number) { target.push(value & 0xff, (value >>> 8) & 0xff); }
function writeU32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

export function createZipBlob(files: Array<{ filename: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.filename);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local: number[] = [];
    writeU32(local, 0x04034b50); writeU16(local, 20); writeU16(local, 0x0800);
    writeU16(local, 0); writeU16(local, 0); writeU16(local, 0);
    writeU32(local, checksum); writeU32(local, data.length); writeU32(local, data.length);
    writeU16(local, nameBytes.length); writeU16(local, 0);
    chunks.push(new Uint8Array(local), nameBytes, data);
    const central: number[] = [];
    writeU32(central, 0x02014b50); writeU16(central, 20); writeU16(central, 20); writeU16(central, 0x0800);
    writeU16(central, 0); writeU16(central, 0); writeU16(central, 0);
    writeU32(central, checksum); writeU32(central, data.length); writeU32(central, data.length);
    writeU16(central, nameBytes.length); writeU16(central, 0); writeU16(central, 0);
    writeU16(central, 0); writeU16(central, 0); writeU32(central, 0); writeU32(central, offset);
    centralDirectory.push(new Uint8Array(central), nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end: number[] = [];
  writeU32(end, 0x06054b50); writeU16(end, 0); writeU16(end, 0);
  writeU16(end, files.length); writeU16(end, files.length);
  writeU32(end, centralSize); writeU32(end, centralOffset); writeU16(end, 0);
  const zipParts = [...chunks, ...centralDirectory, new Uint8Array(end)].map((chunk) => {
    const copy = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(copy).set(chunk);
    return copy;
  });
  return new Blob(zipParts, { type: "application/zip" });
}

export function downloadZip(files: Array<{ filename: string; content: string }>, zipFilename: string) {
  const blob = createZipBlob(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  a.click();
  URL.revokeObjectURL(url);
}
