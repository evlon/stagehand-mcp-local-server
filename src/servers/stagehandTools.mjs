import { z } from 'zod';
import { UserError } from 'fastmcp';
import { createStagehandExecutors } from './stagehandExecs.mjs';

export function registerStagehandTools({ mcpServer, getSession, safeGetPage, generatePlaywrightScript, asset }) {
  const { ensureAssetServer, ensureDirs, ASSET_PORT, SCREEN_DIR } = asset;
  const executors = createStagehandExecutors({ getSession, safeGetPage, generatePlaywrightScript, asset: { ensureAssetServer, ensureDirs, ASSET_PORT, SCREEN_DIR } });

  // 页面管理：创建新页面
  mcpServer.addTool({
    name: 'stagehand_new_page',
    description: '创建一个新的浏览器页面，可选地立即导航到指定 URL。',
    parameters: z.object({
      url: z.string().url().optional().describe('可选：创建后导航到该 URL'),
    }),
    execute: executors.stagehand_new_page,
  });

  // 页面管理：列出页面
  mcpServer.addTool({
    name: 'stagehand_list_pages',
    description: '列出当前会话的所有页面索引，包含活动页索引。',
    parameters: z.object({}),
    execute: executors.stagehand_list_pages,
  });

  // 页面管理：设置活动页
  mcpServer.addTool({
    name: 'stagehand_set_active_page',
    description: '设置当前会话的活动页面索引。',
    parameters: z.object({
      pageIndex: z.number().int().nonnegative().describe('要设为活动的页面索引'),
    }),
    execute: executors.stagehand_set_active_page,
  });

  // 页面导航：goto
  mcpServer.addTool({
    name: 'stagehand_goto',
    description: '在当前或指定页面导航到一个 URL。',
    parameters: z.object({
      url: z.string().url().describe('要导航的 URL'),
      pageIndex: z.number().int().nonnegative().optional().describe('可选：目标页面索引'),
    }),
    execute: executors.stagehand_goto,
  });

  // 页面管理：关闭页面
  mcpServer.addTool({
    name: 'stagehand_close_page',
    description: '关闭指定或活动页面。',
    parameters: z.object({
      pageIndex: z.number().int().nonnegative().optional().describe('可选：要关闭的页面索引'),
    }),
    execute: executors.stagehand_close_page,
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
    execute: executors.stagehand_screenshot,
  });

  // Act
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
    execute: executors.stagehand_act,
  });

  // Observe
  mcpServer.addTool({
    name: 'stagehand_observe',
    description: '观察页面上的元素或操作，支持自然语言指令和多种配置选项。',
    parameters: z.object({
        instruction: z.string().describe('自然语言描述要发现的元素或操作。如果未提供，则默认为查找页面上所有可交互的元素。**必填项**。'),
        options: z.object({
            model: z.string().optional().describe('配置用于此观察的 AI 模型。'),
            timeout: z.number().optional().describe('观察完成的最大等待时间（毫秒）。'),
            selector: z.string().optional().describe('可选的 XPath 选择器。'),
            page: z.string().optional().describe('指定要执行观察的页面。')
        }).optional().describe('观察的配置选项。**选填项**。')
    }),
    returns: z.array(z.object({
        selector: z.string().describe('用于精确定位页面上元素的 XPath 选择器。'),
        description: z.string().describe('元素及其用途的人类可读描述。'),
        method: z.string().optional().describe('建议的元素交互方法。'),
        arguments: z.array(z.string()).optional().describe('建议操作的附加参数。')
    })).describe('按相关性排序的可操作元素数组。'),
    execute: executors.stagehand_observe,
  });

  // Extract
  mcpServer.addTool({
    name: 'stagehand_extract',
    description: '从页面中提取数据，支持自然语言指令、Zod 模式定义和多种配置选项。',
    parameters: z.object({
        instruction: z.string().describe('自然语言描述，说明要提取的数据内容。'),
        schema: z.string().optional().describe('Zod 模式定义。'),
        model: z.string().optional().describe('用于此操作的 AI 模型。'),
        timeout: z.number().optional().describe('提取完成的最大等待时间（毫秒）。'),
        selector: z.string().optional().describe('可选的选择器（XPath、CSS 选择器等）。'),
        page: z.string().optional().describe('指定要执行提取的页面。')
    }),
    returns: z.object({
        pageText: z.string().optional().describe('提取的页面文本内容。'),
        extraction: z.string().optional().describe('根据自然语言指令提取的数据内容。'),
        result: z.string().optional().describe('根据 Zod 模式提取并验证后的数据结果。')
    }).describe('提取结果。'),
    execute: executors.stagehand_extract,
  });

  // Agent
  mcpServer.addTool({
    name: 'stagehand_agent',
    description: '运行一个 Stagehand 代理，以执行复杂的多步骤任务。',
    parameters: z.object({
        instruction: z.string().describe('自然语言中的高级任务描述。'),
        maxSteps: z.number().int().positive().optional().describe('最大行动次数。'),
        cua: z.boolean().optional().describe('是否启用计算机使用代理（CUA）模式。'),
        model: z.string().optional().describe('用于推理的模型。'),
        executionModel: z.string().optional().describe('用于工具执行的模型。'),
        systemPrompt: z.string().optional().describe('自定义系统提示。'),
        integrations: z.array(z.string()).optional().describe('MCP 集成 URL。'),
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
            input_tokens: z.number().describe('输入令牌数。'),
            output_tokens: z.number().describe('生成的输出令牌数。'),
            inference_time_ms: z.number().describe('推理总时间（毫秒）。')
        }).optional().describe('令牌使用和性能指标。')
    }).describe('执行结果。'),
    execute: executors.stagehand_agent,
  });

  // Playwright 生成
  mcpServer.addTool({
    name: 'stagehand_generate_playwright',
    description: '将 Stagehand 历史记录转换为 Playwright 测试脚本字符串。',
    parameters: z.object({
      testName: z.string().optional().describe('生成的测试名称，默认 "Generated Script"'),
      includeComments: z.boolean().optional().describe('是否在脚本中包含注释'),
    }),
    execute: executors.stagehand_generate_playwright,
  });

  // 历史
  mcpServer.addTool({
    name: 'stagehand_history',
    description: '获取 Stagehand 历史记录，返回概要或原始条目。',
    parameters: z.object({
      includeActions: z.boolean().optional().describe('是否包含 action 细节'),
      summarize: z.boolean().optional().describe('是否返回中文概要文本'),
    }),
    execute: executors.stagehand_history,
  });
}