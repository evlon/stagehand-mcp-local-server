import { Stagehand } from "@browserbasehq/stagehand";
import { UserError } from "fastmcp";
import { DeepseekAIClient } from "./deepseek-safe-client.mjs";
import { ChatUAIClient } from "./chatu-client.mjs";
import { JiuTianAIClient } from "./jiutian-client.mjs";
// 管理每个 MCP 会话的 Stagehand 实例与活动页面索引
export function createSessionManager(stagehandConfig) {
  const sessions = new Map(); // sessionId -> { sh: Stagehand, activePageIndex: number }

  async function getSession(context) {
    const sessionId = context?.sessionId || "default";
    let session = sessions.get(sessionId);
    const cacheDir = "./cache";
    if (!session) {
      const modelConfig = stagehandConfig.model;
      const modelName = stagehandConfig.model.modelName;
      let stagehand = undefined;
      if (modelName.indexOf("deepseek/") != -1) {

      stagehand = new Stagehand({
        ...stagehandConfig,
        env: process.env.STAGEHAND_ENV || "LOCAL",
        cacheDir: cacheDir,
        modelName: modelConfig.modelName,

        llmClient: new DeepseekAIClient({
          modelName: modelConfig.modelName,
          logger: stagehandConfig.logger || function(msg){console.log(msg.category, msg.message, msg.level, msg.auxiliary)},
          clientOptions: {
            apiKey: process.env.DEEPSEEK_API_KEY || '',
            baseURL: modelConfig.baseURL
          }
        }),
      });
    }else if (modelName.indexOf("chatu/") != -1) {
        stagehand = new Stagehand({
          ...stagehandConfig,
          env: process.env.STAGEHAND_ENV || "LOCAL",
          cacheDir: cacheDir,
          modelName: modelConfig.modelName,

          llmClient: new ChatUAIClient({
            modelName: modelConfig.modelName,
            logger:
              stagehandConfig.logger ||
              function (msg) {
                console.log(
                  msg.category,
                  msg.message,
                  msg.level,
                  msg.auxiliary
                );
              },
            clientOptions: {
              apiKey: process.env.CHATU_API_KEY || "",
              baseURL: modelConfig.baseURL,
            },
          }),
        });
      } else if (modelName.indexOf("jiutian/") != -1) {
        stagehand = new Stagehand({
          ...stagehandConfig,
          env: process.env.STAGEHAND_ENV || "LOCAL",
          cacheDir: cacheDir,
          modelName: modelConfig.modelName,

          llmClient: new JiuTianAIClient({
            modelName: modelConfig.modelName,
            logger:
              stagehandConfig.logger ||
              function (msg) {
                console.log(
                  msg.category,
                  msg.message,
                  msg.level,
                  msg.auxiliary
                );
              },
            clientOptions: {
              apiKey: process.env.JIUTIAN_API_KEY || "",
              baseURL: modelConfig.baseURL,
            },
          }),
        });
      } else {
        stagehand = new Stagehand({
          ...stagehandConfig,

          llmClient: new DeepseekAIClient({
            modelName: modelName,
            logger:
              stagehandConfig.logger ||
              function (msg) {
                console.log(
                  msg.category,
                  msg.message,
                  msg.level,
                  msg.auxiliary
                );
              },
            clientOptions: {
              apiKey: process.env.DEEPSEEK_API_KEY || "",
              baseURL: stagehandConfig.model.baseURL,
            },
          }),
        });
      }

      await stagehand.init();
      session = { sh: stagehand, activePageIndex: 0 };
      sessions.set(sessionId, session);
      console.log(`Creating new Stagehand session for ID: ${sessionId},`);
    }
    return session;
  }

  function resolvePage(session, pageIndex) {
    const pages = session.sh.context.pages();
    const idx =
      typeof pageIndex === "number" ? pageIndex : session.activePageIndex ?? 0;
    const page = pages[idx];
    if (typeof pageIndex === "number" && !page) {
      throw new UserError(`Invalid pageIndex: ${pageIndex}`);
    }
    if (!page) {
      throw new UserError(
        "No active page. Use stagehand_new_page or stagehand_goto to open one."
      );
    }
    return { page, idx, pages };
  }

  async function safeGetPage(session, pageIndex, { allowCreate = false } = {}) {
    const pages = session.sh.context.pages();
    const idx =
      typeof pageIndex === "number" ? pageIndex : session.activePageIndex ?? 0;
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
