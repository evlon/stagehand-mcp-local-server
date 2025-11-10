## 💾 Stagehand 历史记录 (History API) 的利用方法

### 1\. 获取历史记录

在您的 Stagehand 实例中，可以通过异步属性 `.history` 获取操作历史记录，它返回一个包含所有 Stagehand 操作（以及 `page.goto()`）的数组。

#### 示例代码：

```javascript
import { Stagehand, StagehandHistoryItem } from "@browserbasehq/stagehand";

// ... 假设 stagehand 实例已初始化并执行了一些操作 ...

async function getAndAnalyzeHistory(stagehand) {
    // 异步获取历史记录
    const history = await stagehand.history; 

    console.log(`总操作数: ${history.length}`);
    
    // 历史记录中的每个条目 (entry) 都是 StagehandHistoryItem 类型
    history.forEach((entry, index) => {
        // entry.method: 调用的 Stagehand 方法名 (act, extract, observe, goto)
        // entry.timestamp: 操作时间戳
        console.log(`${index + 1}. 方法: ${entry.method}, 时间: ${entry.timestamp}`);
        
        // entry.action: 包含具体的动作细节，这是我们用来生成 Playwright 脚本的核心！
        // console.log("动作详情:", entry.action); 
    });
    
    return history;
}
```

### 2\. 核心：将历史记录转换为 Playwright 脚本

`StagehandHistoryItem` 中的 `entry.action` 属性包含了执行的具体动作和定位器信息。

| Stagehand 方法 | `entry.action.type` 示例 | Playwright 对应操作 |
| :--- | :--- | :--- |
| `stagehand.act()` | `click`, `fill`, `type`, `press`, `scroll` | `page.click()`, `page.fill()`, `page.keyboard.press()` |
| `page.goto()` | `goto` | `page.goto()` |
| `stagehand.extract()` | `extract` | 无直接对应，通常是 `page.waitForSelector()` 或自定义逻辑。|

#### 脚本生成函数的实现要点：

要将 `entry.action` 转换为 Playwright 脚本，您的定制函数（如前面提到的 `generatePlaywrightScript`）需要：

1.  **识别动作类型 (`entry.action.type`)。**
2.  **提取定位器信息 (`entry.action.selector`)。**
3.  **生成 Playwright 语法。**

<!-- end list -->

```javascript
function generatePlaywrightScript(history) {
    let script = `import { test, expect } from '@playwright/test';\n\ntest('Generated Script', async ({ page }) => {\n`;

    history.forEach(entry => {
        const action = entry.action;
        
        if (action.type === 'goto') {
            script += `  await page.goto('${action.url}');\n`;
        } else if (action.type === 'click') {
            script += `  // Action: ${entry.instruction}\n`;
            script += `  await page.click('${action.selector}');\n`;
        } else if (action.type === 'fill') {
            script += `  // Action: ${entry.instruction}\n`;
            script += `  await page.fill('${action.selector}', '${action.value}');\n`;
        }
        // ... (对其他 Stagehand 动作类型进行类似处理)
    });

    script += `\n});\n`;
    return script;
}
```

### 总结

您现在拥有了将 Stagehand 暴露给 MCP Server 并支持 Playwright 脚本生成所需的关键组件：

1.  **Stagehand MCP Server** (用于暴露 Stagehand 能力)。
2.  **`stagehand.history` API** (用于获取操作序列)。
3.  **定制的脚本生成函数** (用于将操作序列转换为 Playwright 代码)。

下一步，您可能需要将这个定制的脚本生成函数集成到您所部署的 **Browserbase MCP Server** 中，作为新的 MCP 工具暴露给 LLM 客户端。

您希望我针对一个特定的 Stagehand 动作类型（如 `type` 或 `press`）来演示如何生成 Playwright 脚本吗？