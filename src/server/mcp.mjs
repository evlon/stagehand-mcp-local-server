import { FastMCP, UserError } from 'fastmcp';
import config from '../config/config.mjs';
import os from 'os';
import { z } from 'zod';
import { createSessionManager } from '../stagehand/helpers.mjs';
import { generatePlaywrightScript } from '../stagehand/playwright.mjs';
import { registerStagehandTools } from '../stagehand/tools.mjs';
import { createAssetServer } from '../assets/assetServer.mjs';
// 

 async function createMcpServer() {
  // 使用集中配置模块提供的最终 Stagehand 配置
  const mergedStagehandConfig = config.STAGEHAND_CONFIG;
  // 会话管理：改为使用独立模块封装
  const { getSession, safeGetPage } = createSessionManager(mergedStagehandConfig);

  // 资产服务器：提供截图文件访问以节省 LLM tokens
  const ASSET_PORT = Number(config.ASSET_PORT) || 4001;
  const asset = createAssetServer({ port: ASSET_PORT });

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
    asset
  });

  const PORT = config.MCP_PORT ? Number(config.MCP_PORT) : 3333;

  await mcpServer.start({
    transportType: 'httpStream',
    httpStream: { port: PORT },
  });
  // 启动静态资源服务器，便于截图预览
  asset.ensureAssetServer();
};

export { createMcpServer };
