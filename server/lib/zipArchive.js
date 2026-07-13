const fs = require('fs');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function assertSafeZipName(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\')) {
    throw new Error(`Unsafe zip entry name: ${name}`);
  }
  const parts = name.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe zip entry name: ${name}`);
  }
}

function writeZip(zipPath, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const stamp = dosTime();

  for (const entry of entries) {
    assertSafeZipName(entry.name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(stamp.time, 12);
    dir.writeUInt16LE(stamp.date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += local.length + name.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([...chunks, ...central, end]));
}

function findEnd(buffer) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Invalid zip archive: missing central directory');
}

function readZip(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const end = findEnd(buffer);
  const total = buffer.readUInt16LE(end + 10);
  const centralOffset = buffer.readUInt32LE(end + 16);
  let ptr = centralOffset;
  const entries = new Map();

  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Invalid zip archive: bad central directory');
    const method = buffer.readUInt16LE(ptr + 10);
    if (method !== 0) throw new Error('Unsupported zip compression method');
    const expectedCrc = buffer.readUInt32LE(ptr + 16);
    const size = buffer.readUInt32LE(ptr + 24);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    assertSafeZipName(name);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid zip archive: bad local header');
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buffer.slice(dataStart, dataStart + size);
    if (data.length !== size) throw new Error('Invalid zip archive: truncated entry');
    if (crc32(data) !== expectedCrc) throw new Error(`Invalid zip archive: CRC mismatch for ${name}`);
    entries.set(name, Buffer.from(data));
  }
  return entries;
}

module.exports = {
  writeZip,
  readZip,
  crc32
};
