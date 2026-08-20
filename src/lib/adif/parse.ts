export type AdifRecord = Record<string, string>;

export type ParsedAdif = {
  header: AdifRecord;
  records: AdifRecord[];
};

export const ADIF_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const ADIF_MAX_RECORDS = 5000;

/** ADIF tags: <NAME:length> or <NAME:length:type> (e.g. <QSO_DATE:8:D>). */
const FIELD_TAG_WITH_LENGTH_RE = /^([^:>]+):(\d+)(?::[^>]*)?$/;

function parseFieldAt(
  content: string,
  index: number,
): { name: string; value: string; nextIndex: number } | null {
  if (content[index] !== "<") return null;
  const tagEnd = content.indexOf(">", index + 1);
  if (tagEnd === -1) return null;

  const tag = content.slice(index + 1, tagEnd);
  let name: string;
  let length: number;

  const lengthMatch = FIELD_TAG_WITH_LENGTH_RE.exec(tag);
  if (lengthMatch) {
    name = lengthMatch[1]!.toLowerCase();
    length = Number(lengthMatch[2]);
    if (!Number.isFinite(length) || length < 0) return null;
  } else if (tag.trim()) {
    name = tag.trim().toLowerCase();
    length = 0;
  } else {
    return null;
  }

  const valueStart = tagEnd + 1;
  const value = content.slice(valueStart, valueStart + length);
  return { name, value, nextIndex: valueStart + length };
}

export function parseAdifContent(content: string): ParsedAdif {
  const header: AdifRecord = {};
  const records: AdifRecord[] = [];
  let inHeader = true;
  let current: AdifRecord = {};
  let index = 0;

  while (index < content.length) {
    if (content[index] !== "<") {
      index += 1;
      continue;
    }

    const field = parseFieldAt(content, index);
    if (!field) {
      index += 1;
      continue;
    }

    index = field.nextIndex;
    const { name, value } = field;

    if (name === "eoh") {
      inHeader = false;
      continue;
    }

    if (name === "eor") {
      if (Object.keys(current).length > 0) {
        records.push(current);
        if (records.length > ADIF_MAX_RECORDS) {
          throw new Error(`ADIF file exceeds ${ADIF_MAX_RECORDS} records`);
        }
      }
      current = {};
      continue;
    }

    if (inHeader) {
      header[name] = value;
    } else {
      current[name] = value;
    }
  }

  if (Object.keys(current).length > 0) {
    records.push(current);
  }

  return { header, records };
}

export function parseAdifFile(buffer: Buffer): ParsedAdif {
  if (buffer.byteLength > ADIF_MAX_FILE_BYTES) {
    throw new Error(
      `ADIF file exceeds ${Math.round(ADIF_MAX_FILE_BYTES / (1024 * 1024))} MB`,
    );
  }

  const content = buffer.toString("utf8");
  return parseAdifContent(content);
}
