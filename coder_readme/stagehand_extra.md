以下是翻译并整理后的Markdown文件内容：

# Stagehand 文档翻译

## Context

### 概述
`context` 对象管理浏览器上下文，这是一个包含多个页面（标签）的容器。它提供了创建新页面、访问现有页面以及管理当前活动页面的方法。可以通过 Stagehand 实例访问上下文：
```javascript
const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const context = stagehand.context;
```

### 方法

#### newPage()
在浏览器中创建一个新页面（标签）。
```javascript
await context.newPage(url?: string): Promise<Page>
```
- **参数**：`url` - 新页面要导航到的 URL，默认为 `"about:blank"`。
- **返回值**：`Promise<Page>` - 新创建的页面对象。新页面会自动设置为活动页面。

#### pages()
获取浏览器上下文中所有打开的页面。
```javascript
context.pages(): Page[]
```
- **返回值**：`Page[]` - 按从旧到新的顺序排列的所有打开页面的数组。

#### activePage()
获取当前活动页面。
```javascript
context.activePage(): Page | undefined
```
- **返回值**：`Page | undefined` - 最近使用的页面，如果没有页面存在则返回 `undefined`。活动页面的确定依据为：
  1. 最近与之交互的页面。
  2. 如果没有交互历史，则为最近创建的页面。
  3. 如果所有页面都已关闭，则返回 `undefined`。

#### setActivePage()
设置特定页面为活动页面。
```javascript
context.setActivePage(page: Page): void
```
- **参数**：`page` - 要设置为活动的页面，必须是此上下文中存在的页面。
- **功能**：
  - 标记页面为最近使用。
  - 在有头模式下将标签置于前台。
  - 使其成为后续操作的默认页面。

#### close()
关闭浏览器上下文及其所有关联页面。
```javascript
await context.close(): Promise<void>
```
- **功能**：
  - 关闭 CDP 连接。
  - 清理所有页面。
  - 清除所有内部映射。
- **注意**：通常由 `stagehand.close()` 内部调用，通常不需要直接调用此方法。

### 示例代码
```javascript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const context = stagehand.context;

// 创建新页面
const page1 = await context.newPage("https://example.com");
console.log("Created page 1");

// 创建另一个页面
const page2 = await context.newPage("https://another-site.com");
console.log("Created page 2");

// 获取所有页面
const allPages = context.pages();
console.log(`Total pages: ${allPages.length}`);

await stagehand.close();
```

### 活动页面管理
上下文会跟踪当前活动页面：
```javascript
const stagehand = new Stagehand({ env: "LOCAL" });
await stagehand.init();

// 获取当前活动页面
const activePage = stagehand.context.activePage();

// 创建新页面 - 它将成为活动页面
const newPage = await stagehand.context.newPage();

// 现在 context.activePage() 返回 newPage
await newPage.goto("https://example.com");
```

### 上下文与页面的关系
- **上下文**管理浏览器级别的状态和多个页面。
- **页面**代表一个带有内容的单个标签/窗口。
- 通过 `context.newPage()` 创建新页面会自动将其设置为活动页面。
- 可以通过 `context.setActivePage()` 显式控制活动页面。
- 使用 `context.activePage()` 获取当前活动页面。

### 最佳实践
1. **显式创建页面** - 使用 `context.newPage()`，而不是依赖弹出窗口或 `window.open`。
2. **跟踪页面引用** - 将页面对象存储在变量中，便于管理。
3. **在操作前设置活动页面** - 在调用 Stagehand 方法之前，确保正确的页面是活动的。
4. **正确清理** - 调用 `stagehand.close()` 关闭所有页面和上下文。
5. **处理页面顺序** - 记住 `context.pages()` 按创建顺序返回页面。
6. **使用并行操作** - 同时处理多个页面，以提高性能。

### 常见模式

#### 标签管理
```javascript
const pages = {
  home: await context.newPage("https://example.com"),
  dashboard: await context.newPage("https://example.com/dashboard"),
  settings: await context.newPage("https://example.com/settings")
};

// 切换标签
context.setActivePage(pages.dashboard);
await stagehand.act("view report");

context.setActivePage(pages.settings);
await stagehand.act("update preferences");
```

#### 批量数据收集
```javascript
const urls = [
  "https://site1.com",
  "https://site2.com",
  "https://site3.com"
];

// 打开所有页面
const pages = await Promise.all(
  urls.map(url => context.newPage(url))
);

// 从每个页面提取数据
const data = await Promise.all(
  pages.map(page => stagehand.extract("get data", schema, { page }))
);
```

#### 条件页面管理
```javascript
if (needsDashboard) {
  const dashboard = await context.newPage("https://example.com/dashboard");
  context.setActivePage(dashboard);
  await stagehand.act("generate report");
}

if (context.pages().length > 1) {
  console.log("Multiple tabs open");
}
```

### 错误处理
上下文方法可能会抛出以下错误：
- **超时错误** - `newPage()` 等待页面附加时超时。
- **CDP 错误** - 与 Chrome DevTools Protocol 的连接错误。
- **无效页面错误** - 尝试将不存在于上下文中的页面设置为活动页面。

始终适当处理错误：
```javascript
try {
  const page = await context.newPage("https://example.com");
} catch (error) {
  console.error("Failed to create page:", error.message);
}
```

### 类型定义
```typescript
interface V3Context {
  newPage(url?: string): Promise<Page>;
  pages(): Page[];
  activePage(): Page | undefined;
  setActivePage(page: Page): void;
  close(): Promise<void>;
}
```

---

## Page

### 概述
`page` 对象是 Stagehand 中与浏览器页面交互的主要接口。它提供了标准的浏览器自动化功能，用于导航、交互和页面检查。可以通过 Stagehand 实例访问页面对象：
```javascript
const stagehand = new Stagehand({ env: "LOCAL" });
await stagehand.init();
const page = stagehand.context.pages()[0];
```

### 导航方法

#### goto()
导航页面到指定 URL 并等待生命周期状态。
```javascript
await page.goto(url: string, options?: GotoOptions): Promise<Response | null>
```
- **返回值**：如果导航产生网络文档请求，则返回 `Response`，否则返回 `null`（例如 `data:` URL 或同文档导航）。
- **参数**：
  - `url` - 要导航到的 URL，可以是绝对路径或相对路径。
  - `waitUntil` - 决定何时认为导航成功。**选项**：
    - `"load"` - 等待 `load` 事件。
    - `"domcontentloaded"` - 等待 `DOMContentLoaded` 事件（默认）。
    - `"networkidle"` - 等待网络空闲。
  - `timeout` - 等待导航的最大时间（毫秒）。**默认值**：`15000`。

#### reload()
重新加载当前页面。
```javascript
await page.reload(options?: ReloadOptions): Promise<Response | null>
```
- **返回值**：如果刷新的文档产生响应，则返回 `Response`，否则返回 `null`。
- **参数**：
  - `waitUntil` - 决定何时认为重新加载完成。参见 `goto()` 的选项。
  - `timeout` - 等待重新加载的最大时间（毫秒）。**默认值**：`15000`。
  - `bypassCache` - 是否绕过浏览器缓存。**默认值**：`false`。

#### goBack()
在浏览器历史中后退。
```javascript
await page.goBack(options?: NavigationOptions): Promise<Response | null>
```
- **返回值**：如果历史记录条目触发网络请求，则返回 `Response`，否则返回 `null`。
- **参数**：
  - `waitUntil` - 决定何时认为导航完成。
  - `timeout` - 等待的最大时间（毫秒）。**默认值**：`15000`。

#### goForward()
在浏览器历史中前进。
```javascript
await page.goForward(options?: NavigationOptions): Promise<Response | null>
```
- **返回值**：如果导航从网络加载新文档，则返回 `Response`，否则返回 `null`。
- **参数**：
  - `waitUntil` - 决定何时认为导航完成。
  - `timeout` - 等待的最大时间（毫秒）。**默认值**：`15000`。

### 页面信息

#### url()
获取当前页面的 URL（同步）。
```javascript
page.url(): string
```
- **返回值**：当前页面的 URL，作为字符串。

#### title()
获取当前页面的标题。
```javascript
await page.title(): Promise<string>
```
- **返回值**：页面标题，作为字符串。

### 交互方法

#### click()
在页面的绝对坐标处点击。
```javascript
await page.click(x: number, y: number, options?: ClickOptions): Promise<void | string>
```
- **参数**：
  - `x` - CSS 像素中的 X 坐标。
  - `y` - CSS 像素中的 Y 坐标。
  - `options` - 可选的点击配置。
    - `button` - 使用的鼠标按钮：`"left"` | `"right"` | `"middle"`。**默认值**：`"left"`。
    - `clickCount` - 连续点击的次数。**默认值**：`1`。
    - `returnXPath` - 如果为 `true`，返回点击元素的 XPath，而不是 `void`。**默认值**：`false`。

#### type()
在页面中输入文本（触发键盘事件）。
```javascript
await page.type(text: string, options?: TypeOptions): Promise<void>
```
- **参数**：
  - `text` - 要输入的文本。
  - `options` - 可选的输入配置。
    - `delay` - 按键之间的时间间隔（毫秒）。
    - `simulateMistakes` - 模拟输入时的偶尔错误和修正。**默认值**：`false`。

#### locator()
创建用于查询元素的定位器。
```javascript
page.locator(selector: string): Locator
```
- **参数**：`selector` - 元素的 CSS 选择器或 XPath。
- **返回值**：用于与元素交互的 `Locator` 对象。

### 评估

#### evaluate()
在页面上下文中评估 JavaScript 代码。
```javascript
await page.evaluate<R, Arg>(
  pageFunctionOrExpression: string | ((arg: Arg) => R | Promise<R>),
  arg?: Arg
): Promise<R>
```
- **参数**：
  - `pageFunctionOrExpression` - 要在页面上下文中执行的 JavaScript 表达式或函数。
  - `arg` - 可选的参数，传递给函数。
- **返回值**：评估的结果（必须是 JSON 可序列化的）。

### 截图

#### screenshot()
捕获页面的截图。
```javascript
await page.screenshot(options?: ScreenshotOptions): Promise<Buffer>
```
- **参数**：
  - `fullPage` - 是否捕获整个可滚动页面，而不是仅当前视口。**默认值**：`false`。
  - `clip` - 限制捕获范围为指定的 CSS 像素矩形（`{ x, y, width, height }`）。不能与 `fullPage` 同时使用。
  - `type` - 截图的图像格式。**默认值**：`"png"`。
  - `quality` - JPEG 质量（0-100）。仅在 `type` 为 `"jpeg"` 时使用。
  - `scale` - 渲染比例。使用 `"css"` 表示每个 CSS 像素一个像素，或 `"device"` 表示设备像素比例。**默认值**：`"device"`。
  - `animations` - 控制 CSS/Web 动画和过渡。`"disabled"` 表示在捕获前快速快进有限动画并暂停无限动画。**默认值**：`"allow"`。
  - `caret` - 在捕获时隐藏文本光标（`"hide"`）或保持原样（`"initial"`）。**默认值**：`"hide"`。
  - `mask` - 在截图时为指定的定位器覆盖彩色遮罩。
  - `maskColor` - 遮罩的 CSS 颜色。**默认值**：`#FF00FF`。
  - `style` - 在捕获前注入到每个框架中的额外 CSS 文本。用于隐藏或调整动态 UI。
  - `omitBackground` - 使默认页面背景透明（仅 PNG）。**默认值**：`false`。
  - `timeout` - 在抛出错误前等待捕获的最大时间（毫秒）。
  - `path` - 将截图写入指定的文件路径。图像仍将作为缓冲区返回。
- **返回值**：包含截图图像数据的 `Promise<Buffer>`。

### 视口

#### setViewportSize()
设置页面视口大小。
```javascript
await page.setViewportSize(
  width: number,
  height: number,
  options?: ViewportOptions
): Promise<void>
```
- **参数**：
  - `width` - 视口宽度（CSS 像素）。
  - `height` - 视口高度（CSS 像素）。
  - `deviceScaleFactor` - 设备缩放因子（像素比例）。**默认值**：`1`。

### 等待方法

#### waitForLoadState()
等待页面达到特定的生命周期状态。
```javascript
await page.waitForLoadState(state: LoadState, timeoutMs?: number): Promise<void>
```
- **参数**：
  - `state` - 要等待的生命周期状态。**选项**：
    - `"load"` - 等待 `load` 事件（所有资源加载完成）。
    - `"domcontentloaded"` - 等待 `DOMContentLoaded` 事件（DOM 准备就绪）。
    - `"networkidle"` - 等待网络连接空闲。
  - `timeoutMs` - 等待的最大时间（毫秒）。**默认值**：`15000`。

### 事件

#### on("console")
监听页面及其所有采用的 iframe 会话产生的控制台输出。返回页面实例，以便可以链式调用。
```javascript
import type { ConsoleMessage } from "@browserbasehq/stagehand";

const handleConsole = (message: ConsoleMessage) => {
  console.log(`[${message.type()}] ${message.text()}`);
  console.log("Arguments:", message.args());
  const location = message.location();
  if (location?.url) {
    console.log(`Emitted from ${location.url}:${location.lineNumber ?? 0}`);
  }
};

page.on("console", handleConsole);
```
`ConsoleMessage` 提供了用于处理控制台事件的辅助函数：
- `message.type()` – 控制台 API 类别，例如 `log`、`error` 或 `warning`。
- `message.text()` – 控制台参数的字符串表示。
- `message.args()` – 底层 CDP `RemoteObject` 参数数组。
- `message.location()` – 当可用时，提供源 URL、行和列。
- `message.timestamp()` – CDP 事件的时间戳。
- `message.raw()` – 访问原始 `Runtime.consoleAPICalledEvent`。

#### once("console")
注册一个在第一个控制台事件后自动移除的监听器。
```javascript
page.once("console", (message) => {
  console.log("First console message:", message.text());
});
```

#### off("console")
移除之前注册的监听器。引用必须与传递给 `on()` 的原始监听器匹配。
```javascript
page.off("console", handleConsole);
```

### 示例代码

#### 基本导航
```javascript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const page = stagehand.context.pages()[0];

// 导航到 URL
await page.goto("https://example.com");

// 获取当前 URL 和标题
console.log("URL:", page.url());
console.log("Title:", await page.title());

// 后退和前进导航
await page.goBack();
await page.goForward();

// 重新加载页面
await page.reload();
```

### 类型定义

#### LoadState
```typescript
type LoadState = "load" | "domcontentloaded" | "networkidle";
```
- **`"load"`** - 等待 `load` 事件（所有资源加载完成）。
- **`"domcontentloaded"`** - 等待 `DOMContentLoaded` 事件（DOM 准备就绪）。
- **`"networkidle"`** - 等待网络连接空闲。

#### AnyPage
```typescript
type AnyPage = PlaywrightPage | PuppeteerPage | PatchrightPage | Page;
```
Stagehand 支持多种浏览器自动化库。`AnyPage` 类型表示任何兼容的页面对象。

#### ScreenshotClip
```typescript
interface ScreenshotClip {
  x: number;
  y: number;
  width: number;
  height: number;
}
```
当提供 `clip` 时，表示要捕获的 CSS 像素矩形。

#### ScreenshotOptions
```typescript
interface ScreenshotOptions {
  fullPage?: boolean;
  clip?: ScreenshotClip;
  type?: "png" | "jpeg";
  quality?: number;
  scale?: "css" | "device";
  animations?: "allow" | "disabled";
  caret?: "hide" | "initial";
  mask?: Locator[];
  maskColor?: string;
  style?: string;
  omitBackground?: boolean;
  timeout?: number;
  path?: string;
}
```
与 Playwright 的截图签名匹配，提供合理的默认值以控制截图的生成方式。

### 错误处理
页面方法可能会抛出以下错误：
- **导航错误** - 导航时的超时或网络问题。
- **评估错误** - 在 `evaluate()` 中执行 JavaScript 时出错。
- **交互错误** - 点击或输入操作失败。
- **截图错误** - 捕获截图时出现问题。

所有错误都应被捕获并适当处理：
```javascript
try {
  await page.goto("https://example.com");
} catch (error) {
  console.error("Navigation failed:", error.message);
}
```

---

## Locator

### 概述
`Locator` 类提供了精确的元素交互能力。它在框架内解析 CSS 或 XPath 选择器，并使用 Chrome DevTools Protocol (CDP) 执行低级操作。可以通过页面对象创建定位器：
```javascript
const stagehand = new Stagehand({ env: "LOCAL" });
await stagehand.init();
const page = stagehand.context.pages()[0];

// 创建定位器
const button = page.locator("button.submit");
await button.click();
```

### 主要特性
- **延迟解析** - 每次操作时都会重新解析选择器。
- **隔离执行** - 在隔离的世界中运行，与页面脚本分开。
- **基于 CDP** - 使用 Chrome DevTools Protocol 进行可靠的交互。
- **自动清理** - 自动释放远程对象。
- **支持 iframe** - 与 iframe 和 shadow DOM 无缝配合。

### 交互方法

#### click()
在元素的视觉中心点击。
```javascript
await locator.click(options?: ClickOptions): Promise<void>
```
- **参数**：
  - `button` - `"left"` | `"right"` | `"middle"`。使用的鼠标按钮。**默认值**：`"left"`。
  - `clickCount` - 连续点击的次数（用于双击、三击等）。**默认值**：`1`。
- **方法执行**：
  1. 将元素滚动到视图中。
  2. 获取元素几何信息。
  3. 将鼠标移动到中心。
  4. 触发 `mousePressed` 和 `mouseReleased` 事件。

#### fill()
填充输入框、文本域或可编辑内容元素。
```javascript
await locator.fill(value: string): Promise<void>
```
- **参数**：`value` - 要填充到元素中的文本值。
- **方法执行**：
  - 对于特殊输入（如日期、数字等），使用原生值设置器。
  - 对于普通输入，逐字符输入文本。
  - 在填充前清除现有内容。

#### type()
在元素中输入文本，可选地在按键之间设置延迟。
```javascript
await locator.type(text: string, options?: TypeOptions): Promise<void>
```
- **参数**：
  - `text` - 要输入的文本。
  - `delay` - 每次按键之间的延迟（毫秒）。如果未指定，则使用 `Input.insertText` 以提高效率。

#### hover()
将鼠标光标移动到元素的中心而不点击。
```javascript
await locator.hover(): Promise<void>
```
- **方法执行**：
  - 将元素滚动到视图中。
  - 触发鼠标移动事件。

#### selectOption()
在 `<select>` 元素中选择一个或多个选项。
```javascript
await locator.selectOption(values: string | string[]): Promise<string[]>
```
- **参数**：
  - `values` - 要选择的选项值。对于多选元素，传递数组。
- **返回值**：`Promise<string[]>` - 实际选中的值数组。

#### setInputFiles()
在 `<input type="file">` 元素中设置文件。
```javascript
await locator.setInputFiles(files: FileInput): Promise<void>
```
- **参数**：
  - `files` - 要上传的文件路径或文件负载。**文件路径**：文件的绝对路径或相对路径。**文件负载**：包含 `{ name, mimeType, buffer }` 的对象。
- **文件负载接口**：
```typescript
interface FilePayload {
  name: string;
  mimeType: string;
  buffer: ArrayBuffer | Uint8Array | Buffer | string;
}
```
- **方法执行**：
  - 传递空数组以清除文件选择。

### 状态方法

#### isVisible()
检查元素是否可见。
```javascript
await locator.isVisible(): Promise<boolean>
```
- **返回值**：`Promise<boolean>` - 如果元素已附加且可见，则返回 `true`。

#### isChecked()
检查复选框或单选按钮是否被选中。
```javascript
await locator.isChecked(): Promise<boolean>
```
- **返回值**：`Promise<boolean>` - 如果被选中，则返回 `true`。对于 ARIA 小部件，还会考虑 `aria-checked`。

#### inputValue()
获取输入元素的当前值。
```javascript
await locator.inputValue(): Promise<string>
```
- **返回值**：`Promise<string>` - 元素的输入值。适用于 `<input>`、`<textarea>`、`<select>` 和可编辑内容元素。

#### textContent()
获取元素的原始文本内容。
```javascript
await locator.textContent(): Promise<string>
```
- **返回值**：`Promise<string>` - 元素的 `textContent` 属性。

#### innerText()
获取元素的可见文本（布局感知）。
```javascript
await locator.innerText(): Promise<string>
```
- **返回值**：`Promise<string>` - 元素的 `innerText` 属性。

#### innerHtml()
获取元素的 HTML 内容。
```javascript
await locator.innerHtml(): Promise<string>
```
- **返回值**：`Promise<string>` - 元素的 `innerHtml`。

### 选择方法

#### count()
获取匹配选择器的元素数量。
```javascript
await locator.count(): Promise<number>
```
- **返回值**：`Promise<number>` - 匹配元素的数量。

#### nth()
获取指定索引处的元素的定位器。
```javascript
locator.nth(index: number): Locator
```
- **参数**：`index` - 要选择的元素的零基索引。
- **返回值**：`Locator` - 目标第 `n` 个元素的新定位器。

#### first()
获取第一个匹配元素的定位器。
```javascript
locator.first(): Locator
```
- **返回值**：`Locator` - 返回相同的定位器（`querySelector` 已返回第一个匹配项）。

### 实用方法

#### highlight()
使用覆盖层视觉高亮显示元素。
```javascript
await locator.highlight(options?: HighlightOptions): Promise<void>
```
- **参数**：
  - `duration` - 以毫秒为单位显示高亮的时间。**默认值**：`800`。
  - `borderColor` - 边框颜色的 RGBA 值（0-255）。**默认值**：`{ r: 255, g: 0, b: 0, a: 0.9 }`（红色）。
  - `contentFillColor` - 内容填充颜色的 RGBA 值（0-255）。**默认值**：`{ r: 255, g: 200, b: 0, a: 0.2 }`（黄色）。
- **用途**：适用于调试和视觉验证。

#### scrollTo()
将元素滚动到指定位置。
```javascript
await locator.scrollTo(percent: number | string): Promise<void>
```
- **参数**：
  - `percent` - 滚动位置的百分比（0-100）。
- **方法执行**：
  - 对于 `<html>` 或 `<body>` 元素，滚动窗口。否则，滚动元素本身。

#### centroid()
获取元素的中心坐标。
```javascript
await locator.centroid(): Promise<{ x: number; y: number }>
```
- **返回值**：`Promise<{ x, y }>` - 中心点的 CSS 像素坐标。

#### backendNodeId()
获取元素的 DOM 后端节点 ID。
```javascript
await locator.backendNodeId(): Promise<BackendNodeId>
```
- **返回值**：`Promise<BackendNodeId>` - DOM 节点的唯一标识符。在不需要维护元素句柄的情况下，可用于身份比较。

#### sendClickEvent()
在元素上直接触发 DOM 点击事件。
```javascript
await locator.sendClickEvent(options?: EventOptions): Promise<void>
```
- **参数**：
  - `bubbles` - 事件是否冒泡。**默认值**：`true`。
  - `cancelable` - 事件是否可取消。**默认值**：`true`。
  - `composed` - 事件是否跨越 shadow DOM 边界。**默认值**：`true`。
  - `clickCount` - 点击次数。**默认值**：`1`。
- **方法执行**：
  - 直接触发事件，而不是合成真实的指针输入。适用于依赖点击处理程序且不需要命中测试的元素。

### 示例代码

#### 基本交互
```javascript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const page = stagehand.context.pages()[0];

await page.goto("https://example.com");

// 点击按钮
const submitButton = page.locator("button[type=submit]");
await submitButton.click();

// 填充输入框
const emailInput = page.locator("input[name=email]");
await emailInput.fill("user@example.com");

// 带延迟的输入
const searchBox = page.locator("input[type=search]");
await searchBox.type("stagehand", { delay: 100 });

await stagehand.close();
```

### 选择器支持
定位器支持 CSS 和 XPath 选择器：

#### CSS 选择器
```javascript
page.locator("button");                    // 标签
page.locator(".submit-btn");              // 类
page.locator("#login-form");              // ID
page.locator("button.primary");           // 标签 + 类
page.locator("input[type=email]");        // 属性
page.locator("div > p");                  // 子元素
page.locator("h1 + p");                   // 相邻兄弟元素
page.locator("div.container button");     // 后代
```

#### XPath 选择器
```javascript
page.locator("//button");                               // 标签
page.locator("//button[@class='submit']");             // 属性
page.locator("//div[@id='content']//p");               // 后代
page.locator("//button[contains(text(), 'Submit')]");  // 文本内容
page.locator("(//button)[1]");                         // 第一个按钮
page.locator("//input[@type='text'][1]");              // 第一个文本输入框
```

### 最佳实践
1. **使用具体的选择器** - 优先使用 ID 或唯一属性，而不是通用选择器。
2. **使用 `nth()` 链接** - 使用 `locator().nth()`，而不是在选择器中放入索引。
3. **在操作前检查状态** - 使用 `isVisible()`、`isChecked()` 进行条件逻辑。
4. **让定位器自动解析** - 不要存储元素句柄，使用会重新解析的定位器。
5. **使用 `fill()` 处理输入框** - 优先使用 `fill()` 而不是 `click()` + `type()`，以提高可靠性。
6. **正确处理文件上传** - 对于 `setInputFiles()`，使用绝对路径或缓冲区负载。
7. **调试时高亮显示** - 在开发过程中使用 `highlight()` 验证目标。

### 常见模式

#### 条件交互
```javascript
const errorMessage = page.locator(".error-message");
if (await errorMessage.isVisible()) {
  const text = await errorMessage.textContent();
  console.log("Error:", text);
}
```

#### 等待并交互
```javascript
// 定位器在操作期间会自动等待
const dynamicButton = page.locator("button.dynamic");
await dynamicButton.click(); // 等待元素存在
```

#### 遍历元素
```javascript
const items = page.locator("li.item");
const count = await items.count();

for (let i = 0; i < count; i++) {
  const item = items.nth(i);
  const text = await item.innerText();
  console.log(`Item ${i}:`, text);
}
```

### 错误处理
定位器方法可能会抛出以下错误：
- **元素未找到** - 选择器未匹配任何元素。
- **元素不可见** - 元素存在但不可见（对于需要可见性的操作）。
- **无效选择器** - CSS 或 XPath 选择器格式错误。
- **超时错误** - 操作超出超时限制。
- **CDP 错误** - Chrome DevTools Protocol 通信错误。

适当处理错误：
```javascript
try {
  await page.locator("button.submit").click();
} catch (error) {
  console.error("Click failed:", error.message);
}
```

### 类型定义
```typescript
interface Locator {
  // 动作
  click(options?: { button?: MouseButton; clickCount?: number }): Promise<void>;
  fill(value: string): Promise<void>;
  type(text: string, options?: { delay?: number }): Promise<void>;
  hover(): Promise<void>;
  selectOption(values: string | string[]): Promise<string[]>;
  setInputFiles(files: FileInput): Promise<void>;

  // 状态
  isVisible(): Promise<boolean>;
  isChecked(): Promise<boolean>;
  inputValue(): Promise<string>;
  textContent(): Promise<string>;
  innerText(): Promise<string>;
  innerHtml(): Promise<string>;

  // 选择
  count(): Promise<number>;
  nth(index: number): Locator;
  first(): Locator;

  // 实用工具
  highlight(options?: HighlightOptions): Promise<void>;
  scrollTo(percent: number | string): Promise<void>;
  centroid(): Promise<{ x: number; y: number }>;
  backendNodeId(): Promise<BackendNodeId>;
  sendClickEvent(options?: EventOptions): Promise<void>;
}
```

---

## DeepLocator

### 概述
`deepLocator()` 方法创建了一个特殊的定位器，可以使用简化的语法穿越 iframe 边界和 shadow DOM。它会自动为每个操作解析正确的框架，使跨框架交互无缝进行。可以通过页面对象访问：
```javascript
const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const page = stagehand.context.pages()[0];

// 带 iframe 穿越的深度定位器
const button = page.deepLocator("iframe#myframe >> button.submit");
await button.click();
```

### 语法

#### page.deepLocator()
创建一个可以穿越 iframe 和 shadow DOM 边界的深度定位器。
```javascript
page.deepLocator(selector: string): DeepLocatorDelegate
```
- **参数**：`selector` - 带可选 iframe 跳转符号（`>>`）的选择器字符串。支持：
  - **CSS 选择器** - 标准 CSS 语法。
  - **XPath** - 以 `xpath=` 开头或以 `/` 开头。
  - **跳转符号** - 使用 `>>` 穿越 iframe。
  - **深度 XPath** - 自动处理 XPath 中的 iframe 步骤。
- **返回值**：`DeepLocatorDelegate` - 一个类似定位器的对象，在每次操作时解析框架。

### 跳转符号
`>>` 操作符允许你以可读的方式穿越 iframe：
```javascript
// 语法：父选择器 >> 子选择器 >> 目标选择器
page.deepLocator("iframe#outer >> iframe.inner >> button")
```
`>>` 之前的每个段落代表一个要穿越的 iframe。最后一个段落是目标元素。

### 示例
```javascript
// 单个 iframe 跳转
page.deepLocator("iframe#payment >> input#card-number");

// 多个 iframe 跳转
page.deepLocator("iframe#level1 >> iframe#level2 >> div.content");

// 带跳转的 XPath
page.deepLocator("//iframe[@id='myframe'] >> //button[@class='submit']");

// CSS 与 XPath 目标
page.deepLocator("iframe.widget >> xpath=//div[@data-id='123']");
```

### 深度 XPath
当使用 XPath 时，`deepLocator` 会自动识别 `iframe` 步骤并穿越进去：
```javascript
// 自动穿越 iframe
page.deepLocator("//iframe//button");
page.deepLocator("//iframe[@id='myframe']//input[@name='email']");
page.deepLocator("//iframe[1]//iframe[2]//div[@class='target']");
```
定位器会智能解析 XPath，识别 iframe 边界，并为最终选择器解析正确的框架。

### 方法
`DeepLocatorDelegate` 提供了与 `Locator` 相同的 API，自动解析框架：

#### 交互方法
`Locator` 中的所有交互方法都可用：
- **`click(options?)`** - 点击元素。
- **`fill(value)`** - 填充输入框。
- **`type(text, options?)`** - 输入文本。
- **`hover()`** - 鼠标悬停。
- **`selectOption(values)`** - 选择下拉选项。
- **`scrollTo(percent)`** - 滚动元素。

#### 状态方法
- **`isVisible()`** - 检查可见性。
- **`isChecked()`** - 检查复选框状态。
- **`inputValue()`** - 获取输入值。
- **`textContent()`** - 获取文本内容。
- **`innerText()`** - 获取可见文本。
- **`innerHtml()`** - 获取 HTML 内容。

#### 选择方法
- **`count()`** - 计算匹配元素的数量。
- **`nth(index)`** - 按索引选择。
- **`first()`** - 获取第一个元素。

#### 实用方法
- **`highlight(options?)`** - 高亮显示元素。
- **`centroid()`** - 获取中心坐标。
- **`backendNodeId()`** - 获取 DOM 节点 ID。
- **`sendClickEvent(options?)`** - 触发点击事件。

所有方法与 `Locator` 的工作方式相同，但在执行前会自动解析正确的框架。

### 示例代码

#### 基本 iframe 穿越
```javascript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({ env: "BROWSERBASE" });
await stagehand.init();
const page = stagehand.context.pages()[0];

await page.goto("https://example.com");

// 点击 iframe 中的按钮
const button = page.deepLocator("iframe#widget >> button.submit");
await button.click();

// 填充嵌套 iframe 中的输入框
const input = page.deepLocator("iframe#outer >> iframe#inner >> input#email");
await input.fill("user@example.com");

await stagehand.close();
```

### 与标准定位器的比较

#### 标准定位器（单框架）
```javascript
// 仅在主框架中工作
const button = page.locator("button.submit");
await button.click();

// 无法访问 iframe 内的元素
const iframeButton = page.locator("iframe >> button"); // ❌ 不会工作
```

#### 深度定位器（跨框架）
```javascript
// 可以穿越 iframe 边界
const button = page.deepLocator("iframe#widget >> button.submit");
await button.click(); // ✅ 自动穿越 iframe

// 可以处理嵌套 iframe
const nested = page.deepLocator("iframe#a >> iframe#b >> button");
await nested.click(); // ✅ 处理多层嵌套
```

### 使用 `deepLocator` 的场景
使用 `deepLocator()` 时：
1. **目标 iframe 内的元素** - 例如支付表单、嵌入式小部件、第三方内容。
2. **处理嵌套 iframe** - 多层 iframe 嵌套。
3. **XPath 跨越 iframe 边界** - 当 XPath 自然包含 iframe 步骤时。
4. **更简单的语法** - 使用 `>>` 而不是手动切换框架。

使用标准 `locator()` 时：
1. **元素在主框架中** - 不需要穿越 iframe。
2. **性能关键** - 标准定位器略快（无需框架解析）。
3. **使用框架引用** - 已经拥有框架对象。

### 最佳实践
1. **使用具体的选择器** - 让每个段落唯一，避免歧义。
2. **保持跳转链短** - 简单更好，便于维护。
3. **命名 iframe** - 使用 ID 或类为 iframe 命名，便于目标定位。
4. **逐步测试** - 在添加更多内容之前验证每个段落是否有效。
5. **缓存选择器** - 将复杂选择器存储在变量中，便于重用。
6. **调试时使用 `highlight()`** - 验证是否正确目标。

### 常见模式

#### 命名的 iframe 引用
```javascript
// 定义 iframe 选择器
const PAYMENT_FRAME = "iframe#stripe-payment";
const WIDGET_FRAME = "iframe.embedded-widget";

// 在深度定位器中使用
await page.deepLocator(`${PAYMENT_FRAME} >> input#card`).fill("4242");
await page.deepLocator(`${WIDGET_FRAME} >> button`).click();
```

#### 条件 iframe 交互
```javascript
const errorInIframe = page.deepLocator("iframe#form >> .error-message");
if (await errorInIframe.isVisible()) {
  const errorText = await errorInIframe.textContent();
  console.error("Form error:", errorText);
}
```

#### 动态框架选择
```javascript
// 根据属性选择 iframe
const frameSelector = `iframe[data-widget-id="${widgetId}"]`;
const button = page.deepLocator(`${frameSelector} >> button.action`);
await button.click();
```

### 错误处理
深度定位器操作可能会抛出：
- **元素未找到** - 选择器在目标框架中未匹配。
- **框架未找到** - iframe 选择器未解析。
- **超时错误** - 框架或元素解析超时。
- **无效选择器** - 选择器语法错误。

适当处理错误：
```javascript
try {
  await page.deepLocator("iframe#widget >> button").click();
} catch (error) {
  console.error("Deep locator failed:", error.message);
  // 备选或重试逻辑
}
```

### 高级用法

#### 与页面方法结合
```javascript
// 导航后使用深度定位器
await page.goto("https://example.com");
await page.waitForLoadState("networkidle");

const iframeButton = page.deepLocator("iframe#app >> button");
await iframeButton.click();
```

#### 与 AI 驱动的方法结合
```javascript
// 使用 observe 查找 iframe 中的元素
const actions = await stagehand.observe("find buttons in the payment iframe");

// 然后使用深度定位器进行精确交互
await page.deepLocator("iframe#payment >> button.submit").click();
```

### 技术细节

#### 工作原理
1. **解析选择器** - 在 `>>` 处拆分或解析 XPath 中的 iframe 步骤。
2. **构建框架链** - 为每个 iframe 段创建 `FrameLocator` 链。
3. **解析最终框架** - 通过框架导航以找到目标框架。
4. **创建定位器** - 返回正确框架上下文中的定位器。
5. **延迟执行** - 每次操作时都会重新解析框架。

#### 框架解析
深度定位器使用内部 `FrameLocator` 和 `resolveLocatorWithHops` 逻辑：
- 跟踪框架层次结构。
- 处理 OOPIF（进程外 iframe）。
- 支持穿透 shadow DOM。
- 在导航期间维护框架引用。

### 类型定义
```typescript
interface DeepLocatorDelegate {
  // 动作
  click(options?: { button?: MouseButton; clickCount?: number }): Promise<void>;
  fill(value: string): Promise<void>;
  type(text: string, options?: { delay?: number }): Promise<void>;
  hover(): Promise<void>;
  selectOption(values: string | string[]): Promise<string[]>;
  scrollTo(percent: number | string): Promise<void>;

  // 状态
  isVisible(): Promise<boolean>;
  isChecked(): Promise<boolean>;
  inputValue(): Promise<string>;
  textContent(): Promise<string>;
  innerText(): Promise<string>;
  innerHtml(): Promise<string>;

  // 选择
  count(): Promise<number>;
  nth(index: number): DeepLocatorDelegate;
  first(): DeepLocatorDelegate;

  // 实用工具
  highlight(options?: HighlightOptions): Promise<void>;
  centroid(): Promise<{ x: number; y: number }>;
  backendNodeId(): Promise<BackendNodeId>;
  sendClickEvent(options?: EventOptions): Promise<void>;
}
```

---

## Response

### 概述
`Response` 与 Playwright 的 `Response` 接口类似，由 Stagehand 的导航助手（如 `page.goto()`、`page.reload()`、`page.goBack()` 和 `page.goForward()`）返回。它提供了一种方便的方式来检查与导航相关的 HTTP 元数据，按需获取响应正文，并监控底层请求何时完成。Stagehand 会自动为不产生网络请求的导航返回 `null`（例如 `data:` URL、`about:blank` 或同文档历史更改），与 Playwright 的行为一致。

### 获取 Response
```javascript
const response = await page.goto("https://example.com", {
  waitUntil: "networkidle",
});

if (!response) {
  throw new Error("Navigation did not produce a network response");
}

console.log("Status", response.status(), response.statusText());
const body = await response.text();
```

当导航未产生响应对象时，你会收到 `null`，允许你提前分支：
```javascript
const inline = await page.goto("data:text/html,<h1>inline</h1>");
if (inline === null) {
  // 未发生网络请求；相应处理
}
```

### 方法

#### url()
返回与导航请求最终关联的 URL。

#### status()
```javascript
response.status(): number
```
- **返回值**：HTTP 状态码。

#### statusText()
```javascript
response.statusText(): string
```
- **返回值**：人类可读的状态文本（例如 `OK`）。

#### ok()
方便的辅助方法，对于 2xx 响应返回 `true`，否则返回 `false`。

#### frame()
```javascript
response.frame(): Frame | null
```
- **返回值**：发起导航的 Stagehand `Frame`。如果框架不再可用，则返回 `null`。

#### fromServiceWorker()
```javascript
response.fromServiceWorker(): boolean
```
- **返回值**：指示响应是否由 Service Worker fetch 处理程序提供。

#### securityDetails()
```javascript
await response.securityDetails(): Promise<Protocol.Network.SecurityDetails | null>
```
- **返回值**：当可用时，解析为 TLS/安全元数据（颁发者、协议、有效期窗口）。对于不安全或非网络响应，返回 `null`。

#### serverAddr()
```javascript
await response.serverAddr(): Promise<{ ipAddress: string; port: number } | null>
```
- **返回值**：由 Chrome 报告的远程 IP/端口，如果已知。

#### headers()
```javascript
response.headers(): Record<string, string>
```
- **返回值**：返回小写的头映射，与 Playwright 的 `headers()` 行为一致。

#### allHeaders()
```javascript
await response.allHeaders(): Promise<Record<string, string>>
```
- **返回值**：包括通过 Chrome 的 `responseReceivedExtraInfo` 事件公开的额外头（如 `set-cookie`）。

#### headerValue()
```javascript
await response.headerValue(name: string): Promise<string | null>
```
- **返回值**：返回指定头的所有值的逗号分隔字符串。如果头不存在，则解析为 `null`。

#### headerValues()
```javascript
await response.headerValues(name: string): Promise<string[]>
```
- **返回值**：返回头值数组，保留多个条目。

#### headersArray()
```javascript
await response.headersArray(): Promise<Array<{ name: string; value: string }>>
```
- **返回值**：返回头列表，保留浏览器报告的原始大小写和顺序。

### 响应正文助手

#### body()
```javascript
await response.body(): Promise<Buffer>
```
- **返回值**：获取原始响应正文。如果 Chrome 以 base64 编码发送，则会为你解码。

#### text()
```javascript
await response.text(): Promise<string>
```
- **返回值**：将响应正文解码为 UTF-8 文本。

#### json()
```javascript
await response.json<T = unknown>(): Promise<T>
```
- **返回值**：将响应正文解析为 JSON。如果正文无法解析或不是有效的 JSON，则抛出错误。

### 完成
#### finished()
```javascript
await response.finished(): Promise<null | Error>
```
- **返回值**：当主导航请求成功完成时解析为 `null`，如果 Chrome 报告 `Network.loadingFailed`，则解析为 `Error`。这与 Playwright 的 `response.finished()` 合约一致，特别有助于捕获诸如网络重置或阻塞响应之类的晚期失败。
```javascript
const result = await response.finished();
if (result instanceof Error) {
  console.error("Navigation failed", result.message);
}
```

### 使用模式

#### 检查状态和头
```javascript
const response = await page.goto("https://httpbin.org/headers");

if (response) {
  console.log(response.status(), response.statusText());
  const headers = await response.headersArray();
  headers.forEach(({ name, value }) => {
    console.log(`${name}: ${value}`);
  });
}
```

#### 处理非网络导航
```javascript
const result = await page.goto("data:text/html,<p>inline</p>");

if (result === null) {
  console.log("No network response (data URL)");
} else {
  // 按常规处理
}
```

#### 等待完成
```javascript
const response = await page.goto("https://example.com/slow");

if (response) {
  const finished = await response.finished();
  if (finished instanceof Error) {
    console.error("Navigation failed", finished.message);
  }
}
```

### 返回自
- `await page.goto(url, options?)`
- `await page.reload(options?)`
- `await page.goBack(options?)`
- `await page.goForward(options?)`

每个方法根据 Chrome 是否报告文档级网络响应，解析为 `Response | null`。

### 参见
- [Page reference](#page) - 了解导航助手的详细信息

