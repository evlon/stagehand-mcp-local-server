以下是 Stagehand 文档中关于提示（prompting）最佳实践：

好的提示能让 Stagehand 可靠运行，而差的提示会导致失败。以下是如何编写始终有效的提示。

### Act 方法
对网页上的单一操作使用 `act()`。每个操作都应专注且清晰。

```javascript
// 好的例子 - 单一、具体的操作
await stagehand.act("点击 '添加到购物车' 按钮");
await stagehand.act("在电子邮件字段中输入 'user@example.com'");

// 不好的例子 - 组合多个操作
await stagehand.act("填写表单并提交");
await stagehand.act("使用凭据登录并导航到仪表板");
```

### 使用元素类型，而不是颜色
通过类型和功能而非颜色等视觉属性来描述元素。

```javascript
// 好的例子 - 元素类型和描述性文本
await stagehand.act("点击 '登录' 按钮");
await stagehand.act("在电子邮件输入字段中输入");

// 不好的例子 - 基于颜色的描述
await stagehand.act("点击蓝色按钮");
await stagehand.act("在白色输入框中输入");
```

### 使用描述性语言
```javascript
// 好的例子 - 清晰的元素识别
await stagehand.act("点击表单底部的 '下一步' 按钮");
await stagehand.act("在页面顶部的搜索栏中输入");

// 不好的例子 - 模糊的描述
await stagehand.act("点击下一步");
await stagehand.act("在搜索框中输入");
```

### 选择合适的动作动词
- **点击** 用于按钮、链接、复选框
- **输入** 用于文本输入框
- **选择** 用于下拉菜单
- **勾选/取消勾选** 用于复选框
- **上传** 用于文件输入框

```javascript
// 好的例子
await stagehand.act("点击提交按钮");
await stagehand.act("从下拉菜单中选择 '选项1'");

// 不好的例子
await stagehand.act("点击提交");
await stagehand.act("选择选项1");
```

### 保护敏感数据
使用变量将敏感信息从提示和日志中移除。

```javascript
// 对敏感数据使用变量
await stagehand.act("在电子邮件字段中输入 %username%", {
  variables: { username: "user@example.com" }
});

await stagehand.act("在密码字段中输入 %password%", {
  variables: { password: process.env.USER_PASSWORD }
});
```

使用 `extract()` 从页面中提取结构化数据。定义清晰的模式并提供上下文。

### 模式最佳实践
使用描述性字段名称、正确的类型和详细的描述。字段描述提供上下文，帮助模型准确理解要提取的内容。

```javascript
// 好的例子 - 描述性名称、正确的类型和有帮助的描述
const productData = await stagehand.extract(
  "提取产品信息",
  z.object({
    productTitle: z.string().describe("页面上显示的主要产品名称"),
    priceInDollars: z.number().describe("不带货币符号的当前售价数字"),
    isInStock: z.boolean().describe("产品是否可供购买")
  })
);

// 不好的例子 - 通用名称、错误类型、无描述
const data = await stagehand.extract(
  "获取产品详情",
  z.object({
    name: z.string(), // 过于通用，无上下文
    price: z.string(), // 应该是数字
    stock: z.string() // 应该是布尔值，无上下文
  })
);
```

### 使用正确的 URL 类型
使用 `z.string().url()` 指定 URL 类型，告诉 Stagehand 提取 URL。

```javascript
// 好的例子 - 告诉 Stagehand 提取 URL
const links = await stagehand.extract(
  "提取导航链接",
  z.array(z.object({
    text: z.string(),
    url: z.string().url() // URL 提取所需的
  }))
);

// 单个 URL 提取
const contactUrl = await stagehand.extract(
  "提取联系页面 URL",
  z.string().url()
);
```

### Observe 方法
在对它们采取行动之前，使用 `observe()` 发现可操作的元素。

### 首先检查元素
在采取行动之前验证元素是否存在，以避免错误。

```javascript
// 首先检查元素
const loginButtons = await stagehand.observe("找到登录按钮");

if (loginButtons.length > 0) {
  await stagehand.act(loginButtons[0]);
} else {
  console.log("未找到登录按钮");
}
```

### 明确元素类型
```javascript
// 好的例子 - 具体的元素类型
const submitButtons = await stagehand.observe("在表单中找到提交按钮");
const dropdowns = await stagehand.observe("找到状态下拉菜单");

// 不好的例子 - 过于模糊
const elements = await stagehand.observe("找到提交内容");
const things = await stagehand.observe("找到状态选择");
```

### Agent 方法
对复杂的多步骤工作流程使用 `agent()`。提供详细的指令并设置适当的限制。

### 首先导航
不要在代理任务中包含导航。单独处理它。

```javascript
// 好的例子 - 首先导航
await page.goto('https://amazon.com');
await agent.execute('搜索价格低于100美元的无线耳机，并将评分最高的添加到购物车');

// 不好的例子 - 任务中的导航
await agent.execute('去亚马逊，搜索耳机，并添加一个到购物车');
```

### 高度具体
详细的指令会带来更好的结果。

```javascript
// 好的例子 - 详细指令
await agent.execute({
  instruction: "在布鲁克林找到晚上10点后营业、有室外座位且评分4星以上的意大利餐厅。保存前3个结果。",
  maxSteps: 25
});

// 不好的例子 - 模糊指令
await agent.execute("找一些好餐馆");
```

### 设置适当的步骤限制
将步骤限制与任务复杂性相匹配。

```javascript
// 简单任务 - 更少步骤
await agent.execute({
  instruction: "使用电子邮件 'user@example.com' 订阅新闻通讯",
  maxSteps: 10
});

// 复杂任务 - 更多步骤
await agent.execute({
  instruction: "研究并比较5种具有定价和功能的项目管理工作，并进行比较",
  maxSteps: 50
});
```

### 包括成功标准
告诉代理何时完成。

```javascript
// 好的例子 - 清晰的成功标准
await agent.execute({
  instruction: "向购物车添加3个智能手机壳，并确认购物车显示恰好3个项目，总价正确",
  maxSteps: 20
});

// 不好的例子 - 无验证
await agent.execute("向购物车添加一些商品");
```

### 避免常见错误
- **组合多个操作** - 每个 `act()` 调用只执行一个操作
- **使用模糊描述** - 明确要交互的元素
- **暴露敏感数据** - 始终使用变量保存凭据
- **跳过验证** - 在继续之前检查结果

### 测试您的提示
1. **从简单开始** - 首先测试基本功能
2. **逐渐增加复杂性** - 逐步构建复杂工作流程
3. **监控结果** - 使用日志了解发生的情况
4. **根据失败进行迭代** - 当提示不起作用时进行优化

记住：好的提示是迭代的。如果有疑问，更具体而不是更少。