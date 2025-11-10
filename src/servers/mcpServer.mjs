import {FastMCP,UserError} from 'fastmcp';
import {Stagehand} from '@browserbasehq/stagehand';
import config from '../config/config.mjs';
import fs from 'fs';
import path from 'path';
import http from 'http';
import os from 'os';
import { z } from 'zod';
// 

 async function createMcpServer() {

 const defaultStagehandConfig = {
    env: "LOCAL",
    verbose: 2, // 0, 1, or 2
    model: "openai/gpt-4.1-mini", // or any supported model
    cacheDir: "./stagehand_cache",
  };
  let  mergedStagehandConfig = defaultStagehandConfig;

  // 读取 stagehand.config.json 文件
  if (fs.existsSync(config.stagehandConfigFile)) {
    const stagehandConfig = JSON.parse(fs.readFileSync(config.stagehandConfigFile));
    mergedStagehandConfig = { ...defaultStagehandConfig, ...stagehandConfig };
  }
  // 兼容 JSONC：如果 .env 未指向文件且存在 jsonc，则尝试解析
  if (!fs.existsSync(config.stagehandConfigFile) && fs.existsSync('./stagehand.config.jsonc')) {
    try {
      const raw = fs.readFileSync('./stagehand.config.jsonc', 'utf-8');
      const withoutLineComments = raw.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '\n');
      const withoutBlockComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
      const json = JSON.parse(withoutBlockComments || '{}');
      mergedStagehandConfig = { ...defaultStagehandConfig, ...json };
    } catch { /* ignore and keep defaults */ }
  }

  // 环境变量优先级最高：允许通过 env 覆盖配置文件值
  // 支持的变量：STAGEHAND_ENV, STAGEHAND_MODEL, STAGEHAND_MODEL_NAME, STAGEHAND_MODEL_API_KEY, STAGEHAND_MODEL_BASE_URL
  const envOverrides = {};
  if (process.env.STAGEHAND_ENV) envOverrides.env = process.env.STAGEHAND_ENV;
  const envModelName = process.env.STAGEHAND_MODEL_NAME || process.env.STAGEHAND_MODEL;
  const envModelApiKey = process.env.STAGEHAND_MODEL_API_KEY || process.env.STAGEHAND_API_KEY;
  let envModelBaseUrl = process.env.STAGEHAND_MODEL_BASE_URL || process.env.STAGEHAND_BASE_URL;
  // 兼容用户示例中可能带反引号与空格的写法
  if (typeof envModelBaseUrl === 'string') envModelBaseUrl = envModelBaseUrl.replace(/`/g, '').trim();
  if (envModelName || envModelApiKey || envModelBaseUrl) {
    const currentModel = mergedStagehandConfig.model;
    const modelObj = (currentModel && typeof currentModel === 'object') ? { ...currentModel } : {};
    if (envModelName) modelObj.name = envModelName;
    if (envModelApiKey) modelObj.apiKey = envModelApiKey;
    if (envModelBaseUrl) modelObj.baseUrl = envModelBaseUrl;
    envOverrides.model = modelObj;
  }
  // 支持 cacheDir 通过环境变量覆盖，并展开 ~ 路径
  function expandPath(p) {
    if (!p || typeof p !== 'string') return p;
    const clean = p.replace(/`/g, '').trim();
    if (clean.startsWith('~')) return path.join(os.homedir(), clean.slice(1));
    return clean;
  }
  let envCacheDir = process.env.STAGEHAND_CACHE_DIR;
  if (typeof envCacheDir === 'string' && envCacheDir.length) {
    envOverrides.cacheDir = expandPath(envCacheDir);
  }
  mergedStagehandConfig = { ...mergedStagehandConfig, ...envOverrides };
  if (mergedStagehandConfig.cacheDir) {
    mergedStagehandConfig.cacheDir = expandPath(mergedStagehandConfig.cacheDir);
  }

  // 会话隔离：为每个 MCP 会话维护独立的 Stagehand 实例与活动页面索引
  const sessions = new Map(); // sessionId -> { sh: Stagehand, activePageIndex: number }

  async function getSession(context) {
    const sessionId = context?.sessionId || 'default';
    let session = sessions.get(sessionId);
    if (!session) {
      const sh = new Stagehand(mergedStagehandConfig);
      await sh.init();
      session = { sh, activePageIndex: 0 };
      sessions.set(sessionId, session);
    }
    return session;
  }

  function resolvePage(session, pageIndex) {
    const pages = session.sh.context.pages();
    const idx = typeof pageIndex === 'number' ? pageIndex : (session.activePageIndex ?? 0);
    const page = pages[idx];
    if (typeof pageIndex === 'number' && !page) {
      throw new UserError(`Invalid pageIndex: ${pageIndex}`);
    }
    if (!page) {
      throw new UserError('No active page. Use stagehand_new_page or stagehand_goto to open one.');
    }
    return { page, idx, pages };
  }

  // 简易静态资源服务器：提供截图文件访问以节省 LLM tokens
  const ASSET_PORT = Number(process.env.ASSET_PORT) || 4001;
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

  // 注册TOOLS

  // 页面管理：创建新页面
  mcpServer.addTool({
    name: 'stagehand_new_page',
    description: '创建一个新的浏览器页面，可选地立即导航到指定 URL。',
    parameters: z.object({
      url: z.string().url().optional().describe('可选：创建后导航到该 URL'),
    }),
    execute: async (args, context) => {
      const { url } = args;
      const session = await getSession(context);
      const page = await session.sh.context.newPage();
      const pages = session.sh.context.pages();
      const index = pages.indexOf(page);
      if (typeof url === 'string') {
        await page.goto(url);
      }
      session.activePageIndex = index >= 0 ? index : 0;
      return JSON.stringify({ message: 'New page created', index: session.activePageIndex, totalPages: pages.length });
    },
  });

  // 页面管理：列出页面
  mcpServer.addTool({
    name: 'stagehand_list_pages',
    description: '列出当前会话的所有页面索引，包含活动页索引。',
    parameters: z.object({}),
    execute: async (_args, context) => {
      const session = await getSession(context);
      const pages = session.sh.context.pages();
      return JSON.stringify({ total: pages.length, indices: pages.map((_p, i) => i), activeIndex: session.activePageIndex });
    },
  });

  // 页面管理：设置活动页
  mcpServer.addTool({
    name: 'stagehand_set_active_page',
    description: '设置当前会话的活动页面索引。',
    parameters: z.object({
      pageIndex: z.number().int().nonnegative().describe('要设为活动的页面索引'),
    }),
    execute: async (args, context) => {
      const { pageIndex } = args;
      const session = await getSession(context);
      const pages = session.sh.context.pages();
      if (!pages[pageIndex]) throw new UserError(`Invalid pageIndex: ${pageIndex}`);
      session.activePageIndex = pageIndex;
      return JSON.stringify({ message: 'Active page updated', activeIndex: pageIndex });
    },
  });

  // 页面导航：goto
  mcpServer.addTool({
    name: 'stagehand_goto',
    description: '在当前或指定页面导航到一个 URL。',
    parameters: z.object({
      url: z.string().url().describe('要导航的 URL'),
      pageIndex: z.number().int().nonnegative().optional().describe('可选：目标页面索引'),
    }),
    execute: async (args, context) => {
      const { url, pageIndex } = args;
      const session = await getSession(context);
      const { page, idx } = resolvePage(session, pageIndex);
      await page.goto(url);
      session.activePageIndex = idx;
      return JSON.stringify({ message: 'Navigated', url, pageIndex: idx });
    },
  });

  // 页面管理：关闭页面
  mcpServer.addTool({
    name: 'stagehand_close_page',
    description: '关闭指定或活动页面。',
    parameters: z.object({
      pageIndex: z.number().int().nonnegative().optional().describe('可选：要关闭的页面索引'),
    }),
    execute: async (args, context) => {
      const { pageIndex } = args;
      const session = await getSession(context);
      const { page, idx } = resolvePage(session, pageIndex);
      await page.close();
      const pages = session.sh.context.pages();
      session.activePageIndex = Math.min(session.activePageIndex, Math.max(0, pages.length - 1));
      return JSON.stringify({ message: 'Page closed', closedIndex: idx, remaining: pages.length, activeIndex: session.activePageIndex });
    },
  });

  // 截图：返回 URL 或 dataURL
  mcpServer.addTool({
    name: 'stagehand_screenshot',
    description: '对当前或指定页面截图，返回可访问的 URL 或 data URL。',
    parameters: z.object({
      pageIndex: z.number().int().nonnegative().optional().describe('可选：目标页面索引'),
      fullPage: z.boolean().optional().describe('是否全页面截图'),
      type: z.enum(['png','jpeg']).optional().describe('图片格式，默认 png'),
      quality: z.number().int().min(1).max(100).optional().describe('JPEG 质量，仅当 type=jpeg 时有效'),
      clip: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional().describe('裁剪区域'),
      returnMode: z.enum(['url','dataURL']).optional().describe('返回模式：可访问 URL 或 data URL'),
    }),
    execute: async (args, context) => {
      const { pageIndex, fullPage, type = 'png', quality, clip, returnMode = 'url' } = args;
      const session = await getSession(context);
      const { page, idx } = resolvePage(session, pageIndex);
      if (returnMode === 'url') ensureAssetServer();
      ensureDirs();
      const fileName = `shot_${Date.now()}_${Math.random().toString(36).slice(2)}.${type}`;
      const filePath = path.join(SCREEN_DIR, fileName);
      const options = { fullPage, type, quality, clip };
      if (returnMode === 'url') options.path = filePath;
      const buffer = await page.screenshot(options);
      if (returnMode === 'url') {
        const url = `http://localhost:${ASSET_PORT}/screenshots/${fileName}`;
        return JSON.stringify({ url, pageIndex: idx });
      }
      const mime = type === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataURL = `data:${mime};base64,${buffer.toString('base64')}`;
      return JSON.stringify({ dataURL, pageIndex: idx });
    },
  });

  // 将历史记录转换为 Playwright 脚本
  const generatePlaywrightScript = (history, { testName = 'Generated Script', includeComments = true } = {}) => {
    let script = `import { test, expect } from '@playwright/test';\n\n`;
    script += `test('${testName}', async ({ page }) => {\n`;

    for (const entry of history) {
      const action = entry?.action || {};
      const instruction = entry?.instruction || '';
      const type = action?.type || entry?.method;

      const commentLine = includeComments && instruction
        ? `  // Action: ${instruction}\n`
        : '';

      if (type === 'goto') {
        if (action.url) {
          script += `  await page.goto('${action.url}');\n`;
        }
        continue;
      }

      if (type === 'click') {
        if (action.selector) {
          script += commentLine;
          script += `  await page.click('${action.selector}');\n`;
        }
        continue;
      }

      if (type === 'fill') {
        if (action.selector && typeof action.value !== 'undefined') {
          script += commentLine;
          script += `  await page.fill('${action.selector}', '${String(action.value)}');\n`;
        }
        continue;
      }

      if (type === 'type') {
        if (action.selector && typeof action.value !== 'undefined') {
          script += commentLine;
          script += `  await page.type('${action.selector}', '${String(action.value)}');\n`;
        }
        continue;
      }

      if (type === 'press') {
        const key = action.keys || action.key;
        if (action.selector && key) {
          script += commentLine;
          script += `  await page.press('${action.selector}', '${key}');\n`;
        } else if (key) {
          script += commentLine;
          script += `  await page.keyboard.press('${key}');\n`;
        }
        continue;
      }

      if (type === 'scroll') {
        const x = typeof action.x === 'number' ? action.x : 0;
        const y = typeof action.y === 'number' ? action.y : 0;
        script += commentLine;
        script += `  await page.evaluate(({x,y}) => window.scrollBy(x,y), { x: ${x}, y: ${y} });\n`;
        continue;
      }

      // 对无直接映射或未知类型的情况，保留注释方便人工补充
      if (includeComments) {
        script += `  // Unmapped action: ${type} ${JSON.stringify(action)}\n`;
      }
    }

    script += `\n});\n`;
    return script;
  };

  // Act: 执行原子操作（支持会话与页面选择）
  mcpServer.addTool({
    name: 'stagehand_act',
    description: 'Perform an atomic action on the current or specified page.',
    parameters: z.object({
      instruction: z.string().describe('Atomic action instruction, e.g., "Click the sign in button"'),
      pageIndex: z.number().int().nonnegative().optional().describe('Optional page index to target'),
    }),
    execute: async (args, context) => {
      const { instruction, pageIndex } = args;
      const session = await getSession(context);
      const { page } = resolvePage(session, pageIndex);
      await session.sh.act(instruction, { page });
      return 'Action executed';
    },
  });

  // Observe: 规划候选动作（支持会话与页面选择）
  mcpServer.addTool({
    name: 'stagehand_observe',
    description: 'Return candidate actions for an instruction.',
    parameters: z.object({
      instruction: z.string().describe('Instruction to observe, e.g., "Click the sign in button"'),
      pageIndex: z.number().int().nonnegative().optional().describe('Optional page index to target'),
    }),
    execute: async (args, context) => {
      const { instruction, pageIndex } = args;
      const session = await getSession(context);
      const { page } = resolvePage(session, pageIndex);
      const actions = await session.sh.observe(instruction, { page });
      return JSON.stringify(actions);
    },
  });

  // Extract: 信息抽取（支持选择器与指定页面）
  mcpServer.addTool({
    name: 'stagehand_extract',
    description: 'Extract data from the current or specified page, optionally from a selector.',
    parameters: z.object({
      instruction: z.string().describe('Natural-language extraction instruction'),
      selector: z.string().optional().describe('Optional selector (CSS/XPath) to target a specific element'),
      pageIndex: z.number().int().nonnegative().optional().describe('Optional page index to target'),
    }),
    execute: async (args, context) => {
      const { instruction, selector, pageIndex } = args;
      const session = await getSession(context);
      const { page } = resolvePage(session, pageIndex);
      const options = { page };
      if (selector) options.selector = selector;
      const result = await session.sh.extract(instruction, options);
      return JSON.stringify(result);
    },
  });

  // Agent: 多步自动执行（会话隔离）
  mcpServer.addTool({
    name: 'stagehand_agent',
    description: 'Run a Stagehand agent to execute complex multi-step tasks.',
    parameters: z.object({
      instruction: z.string().describe('Task instruction for the agent'),
      maxSteps: z.number().int().positive().optional().describe('Max steps to execute'),
      cua: z.boolean().optional().describe('Enable computer use agent mode'),
      model: z.string().optional().describe('Model to use for reasoning'),
      executionModel: z.string().optional().describe('Model for tool execution'),
      systemPrompt: z.string().optional().describe('Custom system prompt'),
      integrations: z.array(z.string()).optional().describe('MCP integrations URLs'),
    }),
    execute: async (args, context) => {
      const { instruction, maxSteps, cua, model, executionModel, systemPrompt, integrations } = args;
      const session = await getSession(context);
      const agent = session.sh.agent({
        cua,
        model,
        executionModel,
        systemPrompt,
        integrations,
      });
      const result = await agent.execute({ instruction, maxSteps });
      return JSON.stringify({ message: result?.message ?? 'Agent finished' });
    },
  });

  // Playwright 脚本生成工具
  mcpServer.addTool({
    name: 'stagehand_generate_playwright',
    description: '将 Stagehand 历史记录转换为 Playwright 测试脚本字符串。',
    parameters: z.object({
      testName: z.string().optional().describe('生成的测试名称，默认 "Generated Script"'),
      includeComments: z.boolean().optional().describe('是否在脚本中包含注释'),
    }),
    execute: async (args, context) => {
      const { testName, includeComments } = args;
      const session = await getSession(context);
      const history = await session.sh.history;
      const script = generatePlaywrightScript(history, { testName, includeComments });
      return script;
    },
  });

  // History: 获取并分析历史记录
  mcpServer.addTool({
    name: 'stagehand_history',
    description: '获取 Stagehand 历史记录，返回概要或原始条目。',
    parameters: z.object({
      includeActions: z.boolean().optional().describe('是否包含 action 细节'),
      summarize: z.boolean().optional().describe('是否返回中文概要文本'),
    }),
    execute: async (args, context) => {
      const { includeActions, summarize } = args;
      const session = await getSession(context);
      const history = await session.sh.history;
      const entries = history.map((entry, index) => {
        const base = {
          index: index + 1,
          method: entry?.method,
          timestamp: entry?.timestamp,
        };
        if (entry?.instruction) base.instruction = entry.instruction;
        if (includeActions && entry?.action) base.action = entry.action;
        return base;
      });

      if (summarize) {
        const lines = [
          `总操作数: ${history.length}`,
          ...entries.map((e) => `${e.index}. 方法: ${e.method}, 时间: ${e.timestamp}`),
        ];
        return lines.join('\n');
      }

      return JSON.stringify({ count: history.length, entries });
    },
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
