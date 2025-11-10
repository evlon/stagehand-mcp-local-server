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

  // 更安全的页面解析：当未指定或没有活动页面时，可选择自动创建
  async function safeGetPage(session, pageIndex, { allowCreate = false } = {}) {
    const pages = session.sh.context.pages();
    const idx = typeof pageIndex === 'number' ? pageIndex : (session.activePageIndex ?? 0);
    let page = pages[idx];
    if (!page && allowCreate) {
      page = await session.sh.context.newPage();
      const newPages = session.sh.context.pages();
      const index = newPages.indexOf(page);
      session.activePageIndex = index >= 0 ? index : 0;
      return { page, idx: session.activePageIndex, pages: newPages };
    }
    return page ? { page, idx, pages } : null;
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
      const { url, pageIndex } = args || {};
      const session = await getSession(context);
      const got = await safeGetPage(session, pageIndex, { allowCreate: true });
      if (!got) throw new UserError('无法获取页面。');
      const { page, idx } = got;
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
      const { pageIndex } = args || {};
      const session = await getSession(context);
      const pages = session.sh.context.pages();
      if (typeof pageIndex === 'number' && !pages[pageIndex]) {
        throw new UserError(`Invalid pageIndex: ${pageIndex}`);
      }
      const got = await safeGetPage(session, pageIndex);
      if (!got) {
        return JSON.stringify({ message: 'No active page to close', remaining: pages.length, activeIndex: session.activePageIndex });
      }
      const { page, idx } = got;
      await page.close();
      const pages2 = session.sh.context.pages();
      session.activePageIndex = Math.min(session.activePageIndex, Math.max(0, pages2.length - 1));
      return JSON.stringify({ message: 'Page closed', closedIndex: idx, remaining: pages2.length, activeIndex: session.activePageIndex });
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
      const { pageIndex, fullPage, type = 'png', quality, clip, returnMode = 'url' } = args || {};
      const session = await getSession(context);
      const pages = session.sh.context.pages();
      if (typeof pageIndex === 'number' && !pages[pageIndex]) {
        throw new UserError(`Invalid pageIndex: ${pageIndex}`);
      }
      const got = await safeGetPage(session, pageIndex);
      if (!got) {
        throw new UserError('No active page to screenshot. 请先使用 stagehand_new_page 或 stagehand_goto 打开页面。');
      }
      const { page, idx } = got;
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
    description: '执行页面上的操作，支持自然语言指令、确定性动作（无LLM）和多种配置选项。',
    parameters: z.object({
        instruction: z.string().describe('自然语言描述要执行的操作。**必填项**。'),
        action: z.object({
            selector: z.string().describe('用于定位元素的选择器（XPath、CSS选择器等）。**必填项**。'),
            description: z.string().describe('操作的描述，用于自我修复。**必填项**。'),
            method: z.string().describe('使用的方法（例如“click”、“fill”、“type”）。**必填项**。'),
            arguments: z.array(z.string()).describe('传递给方法的参数。**必填项**。')
        }).optional().describe('确定性动作对象，用于直接指定操作细节。**选填项**。'),
        // options: z.object({
        //     model: z.string().optional().describe('配置用于此操作的 AI 模型。可以是以下两种形式之一：\n- 格式为 `provider/model` 的字符串（例如 `openai/gpt-4o`、`anthropic/claude-3-5-sonnet-20241022`）\n- 包含详细配置的对象\n**选填项**。'),
        //     variables: z.record(z.string()).optional().describe('使用 `%variableName%` 语法在指令中引用的键值对变量。变量不会与 LLM 提供商共享，适合用于敏感数据（如密码和 API 密钥）。**选填项**。'),
        //     timeout: z.number().optional().describe('操作完成的最大等待时间（毫秒）。默认值根据配置而变化。**选填项**。'),
        //     page: z.string().optional().describe('指定要执行操作的页面。支持多种浏览器自动化库的页面对象：\n- **Playwright**：原生 Playwright 页面对象\n- **Puppeteer**：Puppeteer 页面对象\n- **Patchright**：Patchright 页面对象\n- **Stagehand Page**：Stagehand 的包装页面对象\n如果未指定，则默认为当前 Stagehand 实例中的“活动”页面。**选填项**。')
        // }).optional().describe('操作的配置选项。**选填项**。')
    }),
    returns: z.object({
        success: z.boolean().describe('操作是否成功完成。'),
        message: z.string().describe('描述操作结果的人类可读消息。'),
        actionDescription: z.string().describe('用于执行操作的指令。'),
        actions: z.array(z.object({
            selector: z.string().describe('用于定位元素的选择器（XPath）。'),
            description: z.string().describe('操作的描述。'),
            method: z.string().describe('使用的方法（例如“click”、“fill”、“type”）。'),
            arguments: z.array(z.string()).describe('传递给方法的参数。')
        })).describe('执行的操作数组。')
    }).describe('操作的结果。'),
    execute: async (args, context) => {
      const { instruction, action, options = {}, pageIndex } = args || {};
      if (!instruction || typeof instruction !== 'string') {
        throw new UserError('instruction 为必填项且必须为字符串');
      }
      const session = await getSession(context);
      const got = await safeGetPage(session, pageIndex);
      if (!got) {
        throw new UserError('No active page. 请先使用 stagehand_new_page 或 stagehand_goto 打开页面。');
      }
      const { page } = got;
      const execOptions = { page };
      if (options && typeof options === 'object') {
        if (typeof options.timeout === 'number') execOptions.timeout = options.timeout;
        if (options.variables && typeof options.variables === 'object') execOptions.variables = options.variables;
        if (typeof options.model !== 'undefined') execOptions.model = options.model;
      }
      if (action && typeof action === 'object') {
        execOptions.action = action;
      }
      const result = await session.sh.act(instruction, execOptions);
      return JSON.stringify(result ?? { success: true, message: 'Action executed' });
    },
  });

  // Observe: 规划候选动作（支持会话与页面选择）
  mcpServer.addTool({
    name: 'stagehand_observe',
    description: '观察页面上的元素或操作，支持自然语言指令和多种配置选项。',
    parameters: z.object({
        instruction: z.string().describe('自然语言描述要发现的元素或操作。如果未提供，则默认为查找页面上所有可交互的元素。**必填项**。'),
        options: z.object({
            model: z.string().optional().describe('配置用于此观察的 AI 模型。可以是以下两种形式之一：\n- 格式为 `provider/model` 的字符串（例如 `openai/gpt-4o`、`anthropic/claude-3-5-sonnet-20241022`）\n- 包含详细配置的对象\n**选填项**。'),
            timeout: z.number().optional().describe('观察完成的最大等待时间（毫秒）。默认值根据配置而变化。**选填项**。'),
            selector: z.string().optional().describe('可选的 XPath 选择器，用于将观察范围限定在页面的特定部分。有助于缩小搜索范围。**选填项**。'),
            page: z.string().optional().describe('指定要执行观察的页面。支持多种浏览器自动化库的页面对象：\n- **Playwright**：原生 Playwright 页面对象\n- **Puppeteer**：Puppeteer 页面对象\n- **Patchright**：Patchright 页面对象\n- **Stagehand Page**：Stagehand 的包装页面对象\n如果未指定，则默认为当前 Stagehand 实例中的“活动”页面。**选填项**。')
        }).optional().describe('观察的配置选项。**选填项**。')
    }),
    returns: z.array(z.object({
        selector: z.string().describe('用于精确定位页面上元素的 XPath 选择器。'),
        description: z.string().describe('元素及其用途的人类可读描述。'),
        method: z.string().optional().describe('建议的元素交互方法（例如 `click`、`fill`、`type`）。**选填项**。'),
        arguments: z.array(z.string()).optional().describe('建议操作的附加参数。**选填项**。')
    })).describe('按相关性排序的可操作元素数组。'),
    execute: async (args, context) => {
      const { instruction, options = {}, pageIndex } = args || {};
      const session = await getSession(context);
      const got = await safeGetPage(session, pageIndex);
      if (!got) {
        throw new UserError('No active page. 请先使用 stagehand_new_page 或 stagehand_goto 打开页面。');
      }
      const { page } = got;
      const execOptions = { page };
      if (options && typeof options === 'object') {
        if (typeof options.selector === 'string') execOptions.selector = options.selector;
        if (typeof options.timeout === 'number') execOptions.timeout = options.timeout;
        if (typeof options.model !== 'undefined') execOptions.model = options.model;
      }
      const actions = await session.sh.observe(instruction || '', execOptions);
      return JSON.stringify(actions);
    },
  });

  // Extract: 信息抽取（支持选择器与指定页面）
  mcpServer.addTool({
    name: 'stagehand_extract',
    description: '从页面中提取数据，支持自然语言指令、Zod 模式定义和多种配置选项。',
    parameters: z.object({
        instruction: z.string().describe('自然语言描述，说明要提取的数据内容。如果未提供且没有模式（schema），则返回原始页面文本。**必填项**。'),
        schema: z.string().optional().describe('Zod 模式定义，用于定义要提取数据的结构。确保类型安全和验证。返回类型将根据模式自动推断。**选填项**。'),
        model: z.string().optional().describe('配置用于此操作的 AI 模型。可以是以下两种形式之一：\n- 格式为 `provider/model` 的字符串（例如 `openai/gpt-5`、`google/gemini-2.5-flash`）\n- 包含详细配置的对象\n**选填项**。'),
        timeout: z.number().optional().describe('提取完成的最大等待时间（毫秒）。默认值根据配置而变化。**选填项**。'),
        selector: z.string().optional().describe('可选的选择器（XPath、CSS 选择器等），用于限制提取范围到页面的特定部分。减少令牌使用并提高准确性。**选填项**。'),
        page: z.string().optional().describe('指定要执行提取的页面。支持多种浏览器自动化库的页面对象：\n- **Playwright**：原生 Playwright 页面对象\n- **Puppeteer**：Puppeteer 页面对象\n- **Patchright**：Patchright 页面对象\n- **Stagehand Page**：Stagehand 的包装页面对象\n如果未指定，则默认为当前 Stagehand 实例中的“活动”页面。**选填项**。')
    }),
    returns: z.object({
        pageText: z.string().optional().describe('提取的页面文本内容。如果未指定模式（schema），则返回原始页面文本。**选填项**。'),
        extraction: z.string().optional().describe('根据自然语言指令提取的数据内容。**选填项**。'),
        result: z.string().optional().describe('根据 Zod 模式提取并验证后的数据结果。返回类型将严格根据 Zod 模式定义。**选填项**。')
    }).describe('提取结果。'),
    execute: async (args, context) => {
      const { instruction, schema, model, timeout, selector, pageIndex } = args || {};
      if (!instruction || typeof instruction !== 'string') {
        throw new UserError('instruction 为必填项且必须为字符串');
      }
      const session = await getSession(context);
      const got = await safeGetPage(session, pageIndex);
      if (!got) {
        throw new UserError('No active page. 请先使用 stagehand_new_page 或 stagehand_goto 打开页面。');
      }
      const { page } = got;
      const options = { page };
      if (typeof selector === 'string') options.selector = selector;
      if (typeof timeout === 'number') options.timeout = timeout;
      if (typeof model !== 'undefined') options.model = model;
      if (typeof schema !== 'undefined') options.schema = schema;
      const result = await session.sh.extract(instruction, options);
      return JSON.stringify(result);
    },
  });

  // Agent: 多步自动执行（会话隔离）
  mcpServer.addTool({
    name: 'stagehand_agent',
    description: '运行一个 Stagehand 代理，以执行复杂的多步骤任务。',
    parameters: z.object({
        instruction: z.string().describe('自然语言中的高级任务描述。**必填项**。'),
        maxSteps: z.number().int().positive().optional().describe('代理在停止之前可以采取的最大行动次数。**选填项**。'),
        cua: z.boolean().optional().describe('指示是否启用计算机使用代理（CUA）模式。当为 false 时，代理使用标准的基于工具的操作，而不是计算机控制。**选填项**。'),
        model: z.string().optional().describe('用于推理的模型。**选填项**。'),
        executionModel: z.string().optional().describe('用于工具执行的模型。**选填项**。'),
        systemPrompt: z.string().optional().describe('自定义系统提示。**选填项**。'),
        integrations: z.array(z.string()).optional().describe('MCP 集成 URL。**选填项**。'),
    }),
    returns: z.object({
        success: z.boolean().describe('任务是否成功完成。'),
        message: z.string().describe('执行结果的描述信息。'),
        actions: z.array(z.object({
            type: z.string().describe('动作类型。'),
            reasoning: z.string().optional().describe('执行该动作的原因。'),
            taskCompleted: z.boolean().optional().describe('该动作是否完成了任务。'),
            action: z.string().optional().describe('具体动作描述。'),
            timeMs: z.number().optional().describe('动作执行时间（毫秒）。'),
            pageText: z.string().optional().describe('页面文本内容。'),
            pageUrl: z.string().optional().describe('页面 URL。'),
            instruction: z.string().optional().describe('动作指令。'),
        })).describe('执行过程中采取的各个动作的详细信息。'),
        completed: z.boolean().describe('代理是否认为任务已经完全完成。'),
        metadata: z.record(z.unknown()).optional().describe('附加的执行元数据和调试信息。'),
        usage: z.object({
            input_tokens: z.number().describe('使用的输入令牌数。'),
            output_tokens: z.number().describe('生成的输出令牌数。'),
            inference_time_ms: z.number().describe('推理总时间（毫秒）。')
        }).optional().describe('令牌使用和性能指标。')
    }).describe('执行结果。'),
    execute: async (args, context) => {
      const { instruction, maxSteps, cua, model, executionModel, systemPrompt, integrations } = args || {};
      const session = await getSession(context);
      const agentOptions = {};
      if (typeof cua === 'boolean') agentOptions.cua = cua;
      if (typeof model !== 'undefined') agentOptions.model = model;
      if (typeof executionModel !== 'undefined') agentOptions.executionModel = executionModel;
      if (typeof systemPrompt === 'string') agentOptions.systemPrompt = systemPrompt;
      if (Array.isArray(integrations)) agentOptions.integrations = integrations;
      const agent = session.sh.agent(agentOptions);
      const execInput = {};
      if (typeof instruction === 'string') execInput.instruction = instruction; else execInput.instruction = '';
      if (typeof maxSteps === 'number') execInput.maxSteps = maxSteps;
      const result = await agent.execute(execInput);
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
