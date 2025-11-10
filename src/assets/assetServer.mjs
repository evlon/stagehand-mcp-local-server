import fs from 'fs';
import path from 'path';
import http from 'http';

export function createAssetServer({ port }) {
  const ASSET_PORT = Number(port) || 4001;
  const PUBLIC_DIR = path.resolve('./public');
  const SCREEN_DIR = path.join(PUBLIC_DIR, 'screenshots');
  let assetServerStarted = false;

  function ensureDirs() {
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    if (!fs.existsSync(SCREEN_DIR)) fs.mkdirSync(SCREEN_DIR, { recursive: true });
  }

  function ensureAssetServer() {
    if (assetServerStarted) return;
    ensureDirs();
    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (url.startsWith('/screenshots/')) {
        const fileName = url.replace('/screenshots/', '');
        const filePath = path.join(SCREEN_DIR, fileName);
        if (fs.existsSync(filePath)) {
          const ext = path.extname(fileName).toLowerCase();
          const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
          res.writeHead(200, { 'Content-Type': type });
          fs.createReadStream(filePath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Static asset server running. Use /screenshots/<file>.');
    });
    server.listen(ASSET_PORT);
    assetServerStarted = true;
    console.log(`[assets] Static server at http://localhost:${ASSET_PORT}/`);
  }

  return { ensureAssetServer, ensureDirs, ASSET_PORT, SCREEN_DIR };
}