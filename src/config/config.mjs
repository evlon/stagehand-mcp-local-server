import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEFAULTS = {
  env: 'LOCAL',
  verbose: 2,
  model: 'openai/gpt-4.1-mini',
  cacheDir: './stagehand_cache',
};

function cleanStr(value) {
  return typeof value === 'string' ? value.replace(/`/g, '').trim() : value;
}

function expandPath(p) {
  const v = cleanStr(p);
  if (!v || typeof v !== 'string') return p;
  return v.startsWith('~') ? path.join(os.homedir(), v.slice(1)) : v;
}

function parseJsonSafe(raw) {
  try { return JSON.parse(raw); } catch { return {}; }
}

function parseJsoncSafe(raw) {
  const noLine = raw.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '\n');
  const noBlock = noLine.replace(/\/\*[\s\S]*?\*\//g, '');
  return parseJsonSafe(noBlock || '{}');
}

function loadConfigFromFile(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) {
    const raw = fs.readFileSync(explicitPath, 'utf-8');
    return explicitPath.endsWith('.jsonc') ? parseJsoncSafe(raw) : parseJsonSafe(raw);
  }
  const jsonPath = './stagehand.config.json';
  const jsoncPath = './stagehand.config.jsonc';
  if (fs.existsSync(jsonPath)) return parseJsonSafe(fs.readFileSync(jsonPath, 'utf-8'));
  if (fs.existsSync(jsoncPath)) return parseJsoncSafe(fs.readFileSync(jsoncPath, 'utf-8'));
  return {};
}

function applyEnvOverrides(base) {
  const next = { ...base };
  if (process.env.STAGEHAND_ENV) next.env = process.env.STAGEHAND_ENV;

  let envModelName = process.env.STAGEHAND_MODEL_NAME || process.env.STAGEHAND_MODEL;
  const envModelApiKey = process.env.STAGEHAND_MODEL_API_KEY || process.env.STAGEHAND_API_KEY;
  let envModelBaseUrl = process.env.STAGEHAND_MODEL_BASE_URL || process.env.STAGEHAND_BASE_URL;
  envModelName = cleanStr(envModelName);
  envModelBaseUrl = cleanStr(envModelBaseUrl);

  if (envModelName || envModelApiKey || envModelBaseUrl) {
    const current = next.model;
    let modelObj = {};
    if (typeof current === 'string' && current.trim()) {
      modelObj.modelName = current.trim();
    } else if (current && typeof current === 'object') {
      modelObj = { ...current };
      if (modelObj.name && !modelObj.modelName) modelObj.modelName = modelObj.name;
    }
    if (envModelName) modelObj.modelName = envModelName;
    if (envModelApiKey) modelObj.apiKey = envModelApiKey;
    if (envModelBaseUrl) modelObj.baseURL = envModelBaseUrl;
    next.model = modelObj;
  }

  const envCacheDir = process.env.STAGEHAND_CACHE_DIR;
  if (typeof envCacheDir === 'string' && envCacheDir.length) next.cacheDir = expandPath(envCacheDir);
  return next;
}

const MCP_PORT = process.env.MCP_PORT || 3333;
const ASSET_PORT = process.env.ASSET_PORT || 4001;

const STAGEHAND_CONFIG_FILE = process.env.STAGEHAND_CONFIGFILE;
const fileConfig = loadConfigFromFile(STAGEHAND_CONFIG_FILE);
let stagehandConfig = applyEnvOverrides({ ...DEFAULTS, ...fileConfig });
if (stagehandConfig.cacheDir) stagehandConfig.cacheDir = expandPath(stagehandConfig.cacheDir);

export default {
  ENV_MSG: process.env.ENV_MSG,
  STAGEHAND_CONFIG_FILE,
  MCP_PORT,
  ASSET_PORT,
  STAGEHAND_CONFIG: stagehandConfig,
};