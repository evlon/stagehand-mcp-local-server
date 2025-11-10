import { UserError } from 'fastmcp';

export function createStagehandExecutors({ getSession, safeGetPage, generatePlaywrightScript, asset }) {
  const { ensureAssetServer, ensureDirs, ASSET_PORT, SCREEN_DIR } = asset;

  return {
    stagehand_new_page: async (args, context) => {
      const { url } = args || {};
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

    stagehand_list_pages: async (_args, context) => {
      const session = await getSession(context);
      const pages = session.sh.context.pages();
      return JSON.stringify({ total: pages.length, indices: pages.map((_p, i) => i), activeIndex: session.activePageIndex });
    },

    stagehand_set_active_page: async (args, context) => {
      const { pageIndex } = args || {};
      const session = await getSession(context);
      const pages = session.sh.context.pages();
      if (!pages[pageIndex]) throw new UserError(`Invalid pageIndex: ${pageIndex}`);
      session.activePageIndex = pageIndex;
      return JSON.stringify({ message: 'Active page updated', activeIndex: pageIndex });
    },

    stagehand_goto: async (args, context) => {
      const { url, pageIndex } = args || {};
      const session = await getSession(context);
      const got = await safeGetPage(session, pageIndex, { allowCreate: true });
      if (!got) throw new UserError('无法获取页面。');
      const { page, idx } = got;
      await page.goto(url);
      session.activePageIndex = idx;
      return JSON.stringify({ message: 'Navigated', url, pageIndex: idx });
    },

    stagehand_close_page: async (args, context) => {
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

    stagehand_screenshot: async (args, context) => {
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
      const filePath = SCREEN_DIR + '/' + fileName;
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

    stagehand_act: async (args, context) => {
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

    stagehand_observe: async (args, context) => {
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

    stagehand_extract: async (args, context) => {
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

    stagehand_agent: async (args, context) => {
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

    stagehand_generate_playwright: async (args, context) => {
      const { testName, includeComments } = args || {};
      const session = await getSession(context);
      const history = await session.sh.history;
      const script = generatePlaywrightScript(history, { testName, includeComments });
      return script;
    },

    stagehand_history: async (args, context) => {
      const { includeActions, summarize } = args || {};
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
  };
}