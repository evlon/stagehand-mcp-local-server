import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 默认值
const DEFAULTS = {
  env: 'LOCAL',
  verbose: 2,
  model: 'openai/gpt-4.1-mini',
  cacheDir: './stagehand_cache',
};

// 解析 JSON 或 JSONC 文件
function loadStagehandConfigFile(stagehandConfigFile) {
  const jsonPath = stagehandConfigFile || './stagehand.config.json';
  const jsoncPath = './stagehand.config.jsonc';
  let fileConfig = {};
  if (jsonPath && fs.existsSync(jsonPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) || {};
    } catch { /* ignore */ }
  } else if (fs.existsSync(jsoncPath)) {
    try {
      const raw = fs.readFileSync(jsoncPath, 'utf-8');
      const withoutLineComments = raw.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '\n');
      const withoutBlockComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
      fileConfig = JSON.parse(withoutBlockComments || '{}');
    } catch { /* ignore */ }
  }
  return fileConfig;
}

// 展开路径中的 ~ 并清理反引号和空格
function expandPath(p) {
  if (!p || typeof p !== 'string') return p;
  const clean = p.replace(/`/g, '').trim();
  if (clean.startsWith('~')) return path.join(os.homedir(), clean.slice(1));
  return clean;
}

// 环境变量覆盖
function applyEnvOverrides(base) {
  const overrides = {};
  if (process.env.STAGEHAND_ENV) overrides.env = process.env.STAGEHAND_ENV;

  const envModelName = process.env.STAGEHAND_MODEL_NAME || process.env.STAGEHAND_MODEL;
  const envModelApiKey = process.env.STAGEHAND_MODEL_API_KEY || process.env.STAGEHAND_API_KEY;
  let envModelBaseUrl = process.env.STAGEHAND_MODEL_BASE_URL || process.env.STAGEHAND_BASE_URL;
  if (typeof envModelBaseUrl === 'string') envModelBaseUrl = envModelBaseUrl.replace(/`/g, '').trim();
  if (envModelName || envModelApiKey || envModelBaseUrl) {
    const currentModel = base.model;
    const modelObj = (currentModel && typeof currentModel === 'object') ? { ...currentModel } : {};
    if (envModelName) modelObj.name = envModelName;
    if (envModelApiKey) modelObj.apiKey = envModelApiKey;
    if (envModelBaseUrl) modelObj.baseUrl = envModelBaseUrl;
    overrides.model = modelObj;
  }

  const envCacheDir = process.env.STAGEHAND_CACHE_DIR;
  if (typeof envCacheDir === 'string' && envCacheDir.length) {
    overrides.cacheDir = expandPath(envCacheDir);
  }
  return { ...base, ...overrides };
}

// 端口（含默认值）
const MCP_PORT = process.env.MCP_PORT || 3333;
const ASSET_PORT = process.env.ASSET_PORT || 4001;

// 计算最终 Stagehand 配置
const stagehandConfigFile = process.env.STAGEHAND_CONFIGFILE;
const fileConfig = loadStagehandConfigFile(stagehandConfigFile);
let stagehandConfig = { ...DEFAULTS, ...fileConfig };
stagehandConfig = applyEnvOverrides(stagehandConfig);
if (stagehandConfig.cacheDir) stagehandConfig.cacheDir = expandPath(stagehandConfig.cacheDir);

export default {
  ENV_MSG: process.env.ENV_MSG,
  STAGEHAND_CONFIG_FILE: stagehandConfigFile,
  MCP_PORT,
  ASSET_PORT,
  STAGEHAND_CONFIG: stagehandConfig,
};