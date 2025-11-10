import { Stagehand } from '@browserbasehq/stagehand';
import { UserError } from 'fastmcp';

// 管理每个 MCP 会话的 Stagehand 实例与活动页面索引
export function createSessionManager(stagehandConfig) {
  const sessions = new Map(); // sessionId -> { sh: Stagehand, activePageIndex: number }

  async function getSession(context) {
    const sessionId = context?.sessionId || 'default';
    let session = sessions.get(sessionId);
    if (!session) {
      const sh = new Stagehand(stagehandConfig);
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

  return { getSession, resolvePage, safeGetPage, sessions };
}

// 根据历史记录生成 Playwright 测试脚本
export function generatePlaywrightScript(history, { testName = 'Generated Script', includeComments = true } = {}) {
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

    if (includeComments) {
      script += `  // Unmapped action: ${type} ${JSON.stringify(action)}\n`;
    }
  }

  script += `\n});\n`;
  return script;
}