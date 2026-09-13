// Dependency-free ZIP writer: STORED entries only (no compression), CRC-32,
// DOS date/time, UTF-8 filenames with the general-purpose "language
// encoding" flag set. Built by hand so scripts/pack-source.mjs needs
// nothing beyond Node's own `fs`/`path` to produce public/dreamscape-
// source.zip during `npm run build` - no dependency on a zip library that
// could be missing, wrong-versioned, or itself worth auditing for a script
// that writes into a production build.
//
// Every entry is stored verbatim rather than deflated: that keeps this file
// small enough to read (and test byte-for-byte) in one sitting, at the cost
// of the archive being larger than a compressed one would be. Fine for a
// few-megabyte source tree.

const CRC_TABLE = buildCrcTable();

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/** Standard CRC-32 (IEEE 802.3 / PKZIP / zlib) of a Buffer or Uint8Array. */
export function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// DOS date/time packing (the only timestamp format a plain ZIP local/
// central header has room for): time is hour:minute:(second/2) in 5/6/5
// bits, date is (year-1980):month:day in 7/4/5 bits.
function dosDateTime(date) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800; // general-purpose bit 11: filename/comment are UTF-8
const VERSION_NEEDED = 20; // 2.0, enough to extract STORED entries
const VERSION_MADE_BY = 0x0314; // high byte 3 = Unix (for the external attrs below), low byte 20 = spec 2.0
const STORED = 0;
const UNIX_FILE_EXTERNAL_ATTR = 0x81a40000; // S_IFREG | 0644, shifted into the high 16 bits

/**
 * Builds a complete ZIP archive (STORED method) from `entries`, each
 * `{ path, data, date? }` where `path` is the forward-slash-separated name
 * to store the entry under, `data` a Buffer of its contents, and `date` an
 * optional JS Date for its DOS mtime (defaults to now).
 *
 * Returns one Buffer: every entry's local file header immediately followed
 * by its data, back to back in `entries` order, then the central directory
 * (one record per entry, pointing back at that entry's local header
 * offset), then the end-of-central-directory record - the standard layout
 * `unzip`/Finder/Explorer expect.
 */
export function buildZip(entries) {
  const chunks = [];
  const centralRecords = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.path, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(entry.date ?? new Date());

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(STORED, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size == uncompressed size (STORED)
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    chunks.push(localHeader, nameBuffer, data);
    centralRecords.push({ nameBuffer, crc, size: data.length, dosTime, dosDate, offset });
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirStart = offset;
  for (const record of centralRecords) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIR_SIG, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(STORED, 10);
    central.writeUInt16LE(record.dosTime, 12);
    central.writeUInt16LE(record.dosDate, 14);
    central.writeUInt32LE(record.crc, 16);
    central.writeUInt32LE(record.size, 20);
    central.writeUInt32LE(record.size, 24);
    central.writeUInt16LE(record.nameBuffer.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(UNIX_FILE_EXTERNAL_ATTR, 38);
    central.writeUInt32LE(record.offset, 42);

    chunks.push(central, record.nameBuffer);
    offset += central.length + record.nameBuffer.length;
  }
  const centralDirSize = offset - centralDirStart;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIR_SIG, 0);
  end.writeUInt16LE(0, 4); // this disk's number
  end.writeUInt16LE(0, 6); // disk where the central directory starts
  end.writeUInt16LE(centralRecords.length, 8); // central directory records on this disk
  end.writeUInt16LE(centralRecords.length, 10); // total central directory records
  end.writeUInt32LE(centralDirSize, 12);
  end.writeUInt32LE(centralDirStart, 16);
  end.writeUInt16LE(0, 20); // comment length
  chunks.push(end);

  return Buffer.concat(chunks);
}
