import { Stagehand } from '@browserbasehq/stagehand';
import { UserError } from 'fastmcp';
import { DeepseekAIClient } from './deepseek-safe-client.mjs';
// 管理每个 MCP 会话的 Stagehand 实例与活动页面索引
export function createSessionManager(stagehandConfig) {
  const sessions = new Map(); // sessionId -> { sh: Stagehand, activePageIndex: number }

  async function getSession(context) {
    const sessionId = context?.sessionId || 'default';
    let session = sessions.get(sessionId);
    if (!session) {
  

      const modelName = stagehandConfig.model.modelName;
      let sh = undefined;
      if (modelName.indexOf("deepseek/") == -1) {
        sh = new Stagehand(stagehandConfig);
      }
      else {
        sh = new Stagehand({
          ...stagehandConfig,
        
          llmClient: new DeepseekAIClient({
            modelName: modelName,
            logger: stagehandConfig.logger || function(msg){console.log(msg.category, msg.message, msg.level, msg.auxiliary)},
            clientOptions: {
              apiKey: process.env.DEEPSEEK_API_KEY || '',
              baseURL: stagehandConfig.model.baseURL
            }
          }),
        });
      }
    


      await sh.init();
      session = { sh, activePageIndex: 0 };
      sessions.set(sessionId, session);
      console.log(`Creating new Stagehand session for ID: ${sessionId},`);
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