import fs from "fs";
import path from "path";

const CANDIDATE_DIRS = [
  path.resolve(process.cwd(), ".data"),
  path.resolve(process.cwd(), "portal", ".data"),
  path.resolve(process.cwd(), "..", ".data"),
  path.resolve(process.cwd(), "..", "portal", ".data"),
  "/home/addp/domains/crm.addp.vn/public_html/portal/.data",
  "/home/addp/domains/crm.addp.vn/public_html/.data",
  "C:\\addp-crm\\.data",
  "C:\\addp-crm\\portal\\.data",
];

function getAllDataDirs() {
  const dirs = new Set();
  if (process.env.DATA_DIR) {
    const custom = path.isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : path.join(process.cwd(), process.env.DATA_DIR);
    dirs.add(path.resolve(custom));
  }
  for (const d of CANDIDATE_DIRS) {
    try {
      if (fs.existsSync(d) || fs.existsSync(path.dirname(d))) {
        dirs.add(path.resolve(d));
      }
    } catch {}
  }
  return Array.from(dirs);
}

export function getAllReadReceipts() {
  const merged = {};
  const dirs = getAllDataDirs();
  for (const d of dirs) {
    const file = path.join(d, "read_receipts.json");
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          Object.assign(merged, parsed);
        }
      } catch {}
    }
  }
  return merged;
}

export function saveReadReceipts(map) {
  try {
    const content = JSON.stringify(map, null, 2);
    const dirs = getAllDataDirs();
    for (const d of dirs) {
      try {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, "read_receipts.json"), content, "utf8");
      } catch {}
    }
    return true;
  } catch (err) {
    console.error("[saveReadReceipts ERROR]", err);
    return false;
  }
}

export function markThreadAsRead(threadId, timestamp = Date.now()) {
  if (!threadId) return false;
  const tidStr = String(threadId).trim();
  const tidClean = tidStr.replace(/^[gu]_/, "");
  const map = getAllReadReceipts();
  const readTs = Number(timestamp) || Date.now();

  map[tidStr] = readTs;
  if (tidClean) map[tidClean] = readTs;

  saveReadReceipts(map);
  return true;
}

export function getThreadReadTimestamp(threadId) {
  if (!threadId) return 0;
  const tidStr = String(threadId).trim();
  const tidClean = tidStr.replace(/^[gu]_/, "");
  const map = getAllReadReceipts();
  return Number(map[tidStr] || map[tidClean] || 0);
}
