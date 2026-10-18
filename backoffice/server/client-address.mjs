import { isIP } from "node:net";

// Only used for limiter buckets. Authentication/setup continue to use the raw
// socket and do not trust proxy headers. Apache overwrites XFF from its peer.
function address(value) {
  if (typeof value !== "string" || value.includes("%")) return null;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return null;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16),
    low = parseInt(mapped[2], 16);
  return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
}

export function limiterIdentity(request, apacheProxy = false) {
  const peer = address(request.socket.remoteAddress) || "local";
  if (apacheProxy && peer === "127.0.0.1") {
    const raw = request.raw.rawHeaders;
    let count = 0;
    for (let i = 0; i < raw.length; i += 2)
      if (raw[i].toLowerCase() === "x-forwarded-for") count++;
    const client = count === 1 && address(request.headers["x-forwarded-for"]);
    if (client) return "apache:" + client;
  }
  // Missing/malformed headers share the socket fallback, never a chosen value.
  return "socket:" + peer;
}
