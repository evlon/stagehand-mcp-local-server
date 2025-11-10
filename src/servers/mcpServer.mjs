import {FastMCP,UserError} from 'fastmcp';
import config from '../config/config.mjs';
import fs from 'fs';
import path from 'path';
import http from 'http';
import os from 'os';
import { z } from 'zod';
import { createSessionManager, generatePlaywrightScript } from './stagehandHelpers.mjs';
import { registerStagehandTools } from './stagehandTools.mjs';
// 

 async function createMcpServer() {
  // 使用集中配置模块提供的最终 Stagehand 配置
  const mergedStagehandConfig = config.STAGEHAND_CONFIG;
  // 会话管理：改为使用独立模块封装
  const { getSession, safeGetPage } = createSessionManager(mergedStagehandConfig);

  // 简易静态资源服务器：提供截图文件访问以节省 LLM tokens
  const ASSET_PORT = Number(config.ASSET_PORT) || 4001;
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
      // Very small static server for /screenshots/*
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
    // eslint-disable-next-line no-console
    console.log(`[assets] Static server at http://localhost:${ASSET_PORT}/`);
  }

  const mcpServer = new FastMCP({
    name: 'Stagehand local MCP',
    version: '1.0.0',
    instructions: 'Tools to interact with Stagehand local server.',
    // Optional health endpoint customizations
    health: { enabled: true, path: '/health', message: 'ok', status: 200 },
    ping: { enabled: true, intervalMs: 15000 },
    roots: { enabled: false },
  });
  // 注册 Stagehand 工具至 MCP（统一从模块加载）
  registerStagehandTools({
    mcpServer,
    getSession,
    safeGetPage,
    generatePlaywrightScript,
    asset: { ensureAssetServer, ensureDirs, ASSET_PORT, SCREEN_DIR }
  });

  const PORT = config.MCP_PORT ? Number(config.MCP_PORT) : 3333;

  await mcpServer.start({
    transportType: 'httpStream',
    httpStream: { port: PORT },
  });
  // 启动静态资源服务器，便于截图预览
  ensureAssetServer();
};

export { createMcpServer };
