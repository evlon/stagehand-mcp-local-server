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