import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStagehandExecutors } from '../src/stagehand/execs.mjs';

function createMockPage(pagesArr) {
  return {
    _gotoCalls: [],
    _closed: false,
    async goto(url) { this._gotoCalls.push(url); },
    async close() { 
      this._closed = true; 
      const idx = pagesArr.indexOf(this);
      if (idx >= 0) pagesArr.splice(idx, 1);
    },
    async screenshot(options = {}) {
      // Simulate returning a Buffer
      const content = `shot-${options.type || 'png'}-${options.fullPage ? 'full' : 'partial'}`;
      return Buffer.from(content);
    },
  };
}

function createMockSession() {
  const pagesArr = [];
  const context = {
    pages: () => pagesArr,
    newPage: async () => { const p = createMockPage(pagesArr); pagesArr.push(p); return p; },
  };
  const sh = {
    context,
    async act(instruction, options) { return { success: true, message: `acted:${instruction}`, options }; },
    async observe(instruction, options) { return [{ selector: '//html/body', description: `observe:${instruction||''}` }]; },
    async extract(instruction, options) { return { result: `extract:${instruction}` }; },
    agent: (opts) => ({ async execute(input) { return { message: `agent:${input.instruction||''}` }; } }),
    history: Promise.resolve([
      { method: 'goto', timestamp: 1, instruction: 'open', action: { url: 'http://example.com' } },
      { method: 'act', timestamp: 2, instruction: 'click' },
    ]),
  };
  return { sh, activePageIndex: 0 };
}

describe('createStagehandExecutors', () => {
  let session;
  let getSession;
  let safeGetPage;
  let generatePlaywrightScript;
  let asset;
  let executors;

  beforeEach(() => {
    session = createMockSession();
    getSession = vi.fn(async () => session);
    safeGetPage = vi.fn(async (sess, pageIndex, opts = {}) => {
      const pages = sess.sh.context.pages();
      let idx = typeof pageIndex === 'number' ? pageIndex : sess.activePageIndex;
      let page = pages[idx];
      if (!page && opts.allowCreate) { page = await sess.sh.context.newPage(); idx = pages.indexOf(page); }
      return page ? { page, idx } : null;
    });
    generatePlaywrightScript = vi.fn((history, { testName = 'Generated Script', includeComments } = {}) => {
      return `// ${testName}\n// steps: ${history.length}\n` + (includeComments ? '// comments included' : '');
    });
    const ensureAssetServer = vi.fn();
    const ensureDirs = vi.fn();
    asset = { ensureAssetServer, ensureDirs, ASSET_PORT: 1234, SCREEN_DIR: '/tmp/screens' };
    executors = createStagehandExecutors({ getSession, safeGetPage, generatePlaywrightScript, asset });
  });

  it('stagehand_new_page creates page and optionally navigates', async () => {
    const res = await executors.stagehand_new_page({ url: 'http://example.com' }, {});
    const obj = JSON.parse(res);
    expect(obj.message).toBe('New page created');
    expect(obj.totalPages).toBe(1);
    const page = session.sh.context.pages()[0];
    expect(page._gotoCalls).toEqual(['http://example.com']);
    expect(session.activePageIndex).toBe(0);
  });

  it('stagehand_list_pages returns indices and activeIndex', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_list_pages({}, {});
    const obj = JSON.parse(res);
    expect(obj.total).toBe(1);
    expect(obj.indices).toEqual([0]);
    expect(obj.activeIndex).toBe(0);
  });

  it('stagehand_set_active_page sets valid index and errors for invalid', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_set_active_page({ pageIndex: 0 }, {});
    const obj = JSON.parse(res);
    expect(obj.activeIndex).toBe(0);
    await expect(executors.stagehand_set_active_page({ pageIndex: 5 }, {})).rejects.toThrow('Invalid pageIndex: 5');
  });

  it('stagehand_goto navigates and updates active index, creating page if needed', async () => {
    const res = await executors.stagehand_goto({ url: 'http://a.com' }, {});
    const obj = JSON.parse(res);
    expect(obj.message).toBe('Navigated');
    expect(obj.url).toBe('http://a.com');
    expect(session.sh.context.pages()[obj.pageIndex]._gotoCalls).toEqual(['http://a.com']);
    expect(session.activePageIndex).toBe(obj.pageIndex);
  });

  it('stagehand_close_page closes current and updates indices', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_close_page({}, {});
    const obj = JSON.parse(res);
    expect(obj.message).toBe('Page closed');
    expect(obj.closedIndex).toBe(0);
    expect(session.sh.context.pages().length).toBe(0);
  });

  it('stagehand_close_page returns message when no active page', async () => {
    const res = await executors.stagehand_close_page({}, {});
    const obj = JSON.parse(res);
    expect(obj.message).toBe('No active page to close');
  });

  it('stagehand_screenshot returns URL mode and calls asset setup', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_screenshot({ returnMode: 'url' }, {});
    const obj = JSON.parse(res);
    expect(obj.url).toMatch(/^http:\/\/localhost:1234\/screenshots\//);
    expect(asset.ensureAssetServer).toHaveBeenCalled();
    expect(asset.ensureDirs).toHaveBeenCalled();
  });

  it('stagehand_screenshot returns dataURL mode', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_screenshot({ returnMode: 'dataURL', type: 'jpeg' }, {});
    const obj = JSON.parse(res);
    expect(obj.dataURL.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('stagehand_act requires instruction and returns result', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_act({ instruction: 'do', options: { timeout: 100 } }, {});
    const obj = JSON.parse(res);
    expect(obj.message.startsWith('acted:do')).toBe(true);
    await expect(executors.stagehand_act({ }, {})).rejects.toThrow(/instruction 为必填项/);
  });

  it('stagehand_observe returns actions JSON', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_observe({ instruction: 'find' }, {});
    const obj = JSON.parse(res);
    expect(Array.isArray(obj)).toBe(true);
    expect(obj[0].selector).toBe('//html/body');
  });

  it('stagehand_extract returns result JSON', async () => {
    await executors.stagehand_new_page({}, {});
    const res = await executors.stagehand_extract({ instruction: 'what' }, {});
    const obj = JSON.parse(res);
    expect(obj.result.startsWith('extract:what')).toBe(true);
  });

  it('stagehand_agent executes and returns message', async () => {
    const res = await executors.stagehand_agent({ instruction: 'plan', maxSteps: 3 }, {});
    const obj = JSON.parse(res);
    expect(obj.message).toBe('agent:plan');
  });

  it('stagehand_generate_playwright uses history and options', async () => {
    const script = await executors.stagehand_generate_playwright({ testName: 'MyTest', includeComments: true }, {});
    expect(script).toMatch(/MyTest/);
    expect(script).toMatch(/comments included/);
    expect(generatePlaywrightScript).toHaveBeenCalled();
  });

  it('stagehand_history returns summary or JSON entries', async () => {
    const summary = await executors.stagehand_history({ summarize: true }, {});
    expect(summary).toMatch(/总操作数/);
    const res = await executors.stagehand_history({ includeActions: true }, {});
    const obj = JSON.parse(res);
    expect(obj.count).toBe(2);
    expect(obj.entries[0].action.url).toBe('http://example.com');
  });
});