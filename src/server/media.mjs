import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';

const MIME = new Map([
  ['.mp4', 'video/mp4'], ['.webm', 'video/webm'], ['.mov', 'video/quicktime'], ['.mkv', 'video/x-matroska'],
  ['.gif', 'image/gif'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'],
]);

export function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) { start = Math.max(0, size - end); end = size - 1; }
  else { start ??= 0; end ??= size - 1; }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
}

export function serveMedia(req, res, file) {
  let stat;
  try { stat = statSync(file); } catch { res.writeHead(404).end('Not found'); return; }
  if (!stat.isFile()) { res.writeHead(404).end('Not found'); return; }
  const type = MIME.get(extname(file).toLowerCase()) || 'application/octet-stream';
  const range = parseRange(req.headers.range, stat.size);
  const common = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  if (range?.invalid) {
    res.writeHead(416, { ...common, 'Content-Range': `bytes */${stat.size}` }).end();
    return;
  }
  if (range) {
    const length = range.end - range.start + 1;
    res.writeHead(206, { ...common, 'Content-Length': length, 'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}` });
    createReadStream(file, { start: range.start, end: range.end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...common, 'Content-Length': stat.size });
  createReadStream(file).pipe(res);
}
