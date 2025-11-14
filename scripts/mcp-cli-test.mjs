#!/usr/bin/env node
// Simple CLI test script to drive Stagehand MCP executors directly.
// It reproduces the three steps you provided and prints structured results.

import config from '../src/config/config.mjs';
import { createSessionManager } from '../src/stagehand/helpers.mjs';
import { generatePlaywrightScript } from '../src/stagehand/playwright.mjs';
import { createStagehandExecutors } from '../src/stagehand/execs.mjs';
import { createAssetServer } from '../src/assets/assetServer.mjs';

function envelopeResult({ serverName, toolName, err, resultJsonString }) {
  const isError = !!err;
  const messageText = isError
    ? `Tool '${toolName}' execution failed: ${String(err && err.message || err || 'Unknown error')}`
    : resultJsonString;
  const payload = {
    serverName,
    toolName,
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text: messageText }],
  };
  return { type: 'text', text: JSON.stringify(payload, null, 2) };
}

async function main() {
  const SERVER_NAME = 'stagehand_local';
  const stagehandConfig = config.STAGEHAND_CONFIG;

  // Prepare session manager and asset server like MCP does
  const { getSession, safeGetPage } = createSessionManager(stagehandConfig);
  const ASSET_PORT = Number(config.ASSET_PORT) || 4001;
  const asset = createAssetServer({ port: ASSET_PORT });
  const executors = createStagehandExecutors({ getSession, safeGetPage, generatePlaywrightScript, asset });

  const context = { sessionId: 'cli' };

  // Step 1: stagehand_goto


  let args1 = { url: ' `https://www.baidu.com` ' };
  let out1;
  try {
    const res = await executors.stagehand_goto(args1, context);
    out1 = envelopeResult({ serverName: SERVER_NAME, toolName: 'stagehand_goto', resultJsonString: res });
  } catch (err) {
    out1 = envelopeResult({ serverName: SERVER_NAME, toolName: 'stagehand_goto', err });
  }
  console.log('---\nParameters:');
  console.log(JSON.stringify({ serverName: SERVER_NAME, toolName: 'stagehand_goto', arguments: args1 }, null, 2));
  console.log('Result:');
  console.log(JSON.stringify(out1, null, 2));

  // Step 2: stagehand_observe


  let args2 = { instruction: '找到百度首页的搜索输入框' };
  let out2;
  try {
    const res = await executors.stagehand_observe(args2, context);
    out2 = envelopeResult({ serverName: SERVER_NAME, toolName: 'stagehand_observe', resultJsonString: res });
  } catch (err) {
    out2 = envelopeResult({ serverName: SERVER_NAME, toolName: 'stagehand_observe', err });
  }
  console.log('---\nParameters:');
  console.log(JSON.stringify({ serverName: SERVER_NAME, toolName: 'stagehand_observe', arguments: args2 }, null, 2));
  console.log('Result:');
  console.log(JSON.stringify(out2, null, 2));

  // Step 3: stagehand_act
  let args3 = { instruction: "在百度搜索框中输入'中国人'并点击搜索按钮" };
  let out3;
  try {
    const res = await executors.stagehand_act(args3, context);
    out3 = envelopeResult({ serverName: SERVER_NAME, toolName: 'stagehand_act', resultJsonString: res });
  } catch (err) {
    out3 = envelopeResult({ serverName: SERVER_NAME, toolName: 'stagehand_act', err });
  }
  console.log('---\nParameters:');
  console.log(JSON.stringify({ serverName: SERVER_NAME, toolName: 'stagehand_act', arguments: args3 }, null, 2));
  console.log('Result:');
  console.log(JSON.stringify(out3, null, 2));
}

main().catch((err) => {
  console.error('CLI error:', err);
  process.exit(1);
});