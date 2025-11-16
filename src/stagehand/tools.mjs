import { z } from 'zod';
import { UserError } from 'fastmcp';
import { createStagehandExecutors } from './execs.mjs';
import config from '../config/config.mjs';

export function registerStagehandTools({ mcpServer, getSession, safeGetPage, generatePlaywrightScript, asset }) {
  const { ensureAssetServer, ensureDirs, ASSET_PORT, SCREEN_DIR } = asset;
  const executors = createStagehandExecutors({ getSession, safeGetPage, generatePlaywrightScript, asset: { ensureAssetServer, ensureDirs, ASSET_PORT, SCREEN_DIR } });
  const { STAGEHAND_CONFIG } = config;
  const ENABLE_MODEL_OVERRIDE = !!(process.env.STAGEHAND_ENABLE_MODEL_OVERRIDE ?? STAGEHAND_CONFIG?.enableModelOverride);
  const ENABLE_MULTI_PAGE = !!(process.env.STAGEHAND_ENABLE_MULTI_PAGE ?? STAGEHAND_CONFIG?.enableMultiPage);

  
  // 页面导航：goto
  mcpServer.addTool({
    name: 'stagehand_goto',
    description: '页面导航：在当前或指定页面跳转到目标 URL。若不存在活动页则自动创建。请仅用于导航，不要混入登录或表单等复杂流程。URL 必须为有效的 http(s)。\n高级参数：多页索引通过 STAGEHAND_ENABLE_MULTI_PAGE=1 开启。',
    parameters: (z.object({ url: z.string().url().describe('要导航的 URL') })
    ),
    execute: executors.stagehand_goto,
  });



  // 截图：返回 URL 或 dataURL
  mcpServer.addTool({
    name: 'stagehand_screenshot',
    description: '页面截图：对当前或指定页面截图。默认返回可访问 URL（适合分享与记录），也可返回 dataURL。建议先导航到稳定页面后再截图。\n高级参数：多页索引通过 STAGEHAND_ENABLE_MULTI_PAGE=1 开启。',
    parameters: (z.object({
          fullPage: z.boolean().optional().describe('是否全页面截图（默认 false）'),
          type: z.enum(['png','jpeg']).optional().describe('图片格式（默认 png）'),
          quality: z.number().int().min(1).max(100).optional().describe('JPEG 质量，仅当 type=jpeg 时有效'),
          clip: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional().describe('裁剪区域（进阶选项）'),
          returnMode: z.enum(['url','dataURL']).optional().describe('返回模式：url（默认）或 dataURL'),
        })
    ),
    execute: executors.stagehand_screenshot,
  });

  // Act
  mcpServer.addTool({
    name: 'stagehand_act',
    description: '页面操作：每次仅执行一个具体操作（最佳实践）。使用描述性语言与正确动词（点击/输入/选择等），避免颜色等视觉属性。建议先使用 stagehand_observe 发现元素再行动。',
    parameters: z.object({
        instruction: z.string().describe('自然语言描述要执行的操作。**必填项**。')
    }),
    // returns: z.object({
    //     success: z.boolean().describe('操作是否成功完成。'),
    //     message: z.string().describe('描述操作结果的人类可读消息。'),
    //     actionDescription: z.string().describe('用于执行操作的指令。'),
    //     actions: z.array(z.object({
    //         selector: z.string().describe('用于定位元素的选择器（XPath）。'),
    //         description: z.string().describe('操作的描述。'),
    //         method: z.string().describe('使用的方法（例如“click”、“fill”、“type”）。'),
    //         arguments: z.array(z.string()).describe('传递给方法的参数。')
    //     })).describe('执行的操作数组。')
    // }).describe('操作的结果。'),
    execute: executors.stagehand_act,
  });

  // Observe
  mcpServer.addTool({
    name: 'stagehand_observe',
    description: '页面观察：发现可操作元素，通常在 act 前执行。使用清晰指令（如“在表单中找到提交按钮”），可选提供选择器与超时。返回按相关性排序的可操作元素列表。',
    parameters: (z.object({
          instruction: z.string().describe('自然语言描述要发现的元素或操作；为空则返回所有可交互元素。'),
          selector: z.string().optional().describe('可选：限制在该选择器范围内观察（XPath/CSS）。'),
          timeout: z.number().optional().describe('可选：最大等待时间（毫秒）。')
        })
    ),
    // returns: z.array(z.object({
    //     selector: z.string().describe('用于精确定位页面上元素的 XPath 选择器。'),
    //     description: z.string().describe('元素及其用途的人类可读描述。'),
    //     method: z.string().optional().describe('建议的元素交互方法。'),
    //     arguments: z.array(z.string()).optional().describe('建议操作的附加参数。')
    // })).describe('按相关性排序的可操作元素数组。'),
    execute: executors.stagehand_observe,
  });

  // Extract
  mcpServer.addTool({
    name: 'stagehand_extract',
    description: '页面提取：根据指令提取结构化数据。建议使用JSON描述性字段、正确类型（举例：{ "name": "string", "age": "number" } ）（最佳实践）。',
    parameters: (z.object({
          instruction: z.string().describe('自然语言描述，说明要提取的数据内容。'),
          timeout: z.number().optional().describe('提取完成的最大等待时间（毫秒）。'),
          selector: z.string().optional().describe('可选的选择器（XPath、CSS 选择器等）。'),
          page: z.string().optional().describe('指定要执行提取的页面。')
        })
    ),
    // returns: z.object({
    //     pageText: z.string().optional().describe('提取的页面文本内容。'),
    //     extraction: z.string().optional().describe('根据自然语言指令提取的数据内容。'),
    //     result: z.string().optional().describe('根据 Zod 模式提取并验证后的数据结果。')
    // }).describe('提取结果。'),
    execute: executors.stagehand_extract,
  });

  // Agent
  mcpServer.addTool({
    name: 'stagehand_agent',
    description: '多步骤代理：执行复杂工作流。最佳实践：先独立导航（使用 stagehand_goto），提供高度具体的指令，设置合适的 maxSteps，并在指令中包含清晰的成功标准。\n高级参数：模型覆盖通过 STAGEHAND_ENABLE_MODEL_OVERRIDE=1 开启。',
    parameters: ( z.object({
          instruction: z.string().describe('自然语言中的高级任务描述。'),
          maxSteps: z.number().int().positive().optional().describe('最大行动次数。'),
          // cua: z.boolean().optional().describe('是否启用计算机使用代理（CUA）模式。'),
          systemPrompt: z.string().optional().describe('自定义系统提示。'),
          // integrations: z.array(z.string()).optional().describe('MCP 集成 URL。'),
        })
    ),
    // returns: z.object({
    //     success: z.boolean().describe('任务是否成功完成。'),
    //     message: z.string().describe('执行结果的描述信息。'),
    //     actions: z.array(z.object({
    //         type: z.string().describe('动作类型。'),
    //         reasoning: z.string().optional().describe('执行该动作的原因。'),
    //         taskCompleted: z.boolean().optional().describe('该动作是否完成了任务。'),
    //         action: z.string().optional().describe('具体动作描述。'),
    //         timeMs: z.number().optional().describe('动作执行时间（毫秒）。'),
    //         pageText: z.string().optional().describe('页面文本内容。'),
    //         pageUrl: z.string().optional().describe('页面 URL。'),
    //         instruction: z.string().optional().describe('动作指令。'),
    //     })).describe('执行过程中采取的各个动作的详细信息。'),
    //     completed: z.boolean().describe('代理是否认为任务已经完全完成。'),
    //     metadata: z.record(z.unknown()).optional().describe('附加的执行元数据和调试信息。'),
    //     usage: z.object({
    //         input_tokens: z.number().describe('输入令牌数。'),
    //         output_tokens: z.number().describe('生成的输出令牌数。'),
    //         inference_time_ms: z.number().describe('推理总时间（毫秒）。')
    //     }).optional().describe('令牌使用和性能指标。')
    // }).describe('执行结果。'),
    execute: executors.stagehand_agent,
  });

  // Playwright 生成
  mcpServer.addTool({
    name: 'stagehand_generate_playwright',
    description: 'Playwright 脚本生成：将 Stagehand 历史转换为可执行的 Playwright 测试字符串。可选包含注释，便于审阅与维护。',
    parameters: z.object({
      testName: z.string().optional().describe('生成的测试名称，默认 "Generated Script"'),
      includeComments: z.boolean().optional().describe('是否在脚本中包含注释'),
    }),
    execute: executors.stagehand_generate_playwright,
  });

  // 历史
  mcpServer.addTool({
    name: 'stagehand_history',
    description: '历史记录：获取 Stagehand 执行历史。可返回中文概要或原始条目（含方法、时间戳、指令）。适合调试和生成测试脚本。',
    parameters: z.object({
      includeActions: z.boolean().optional().describe('是否包含 action 细节'),
      summarize: z.boolean().optional().describe('是否返回中文概要文本'),
    }),
    execute: executors.stagehand_history,
  });
}