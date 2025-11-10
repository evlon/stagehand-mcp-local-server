import 'dotenv/config';

export default {
  env: process.env.ENV_MSG,
  stagehandConfigFile: process.env.STAGEHAND_CONFIGFILE,
  MCP_PORT: process.env.MCP_PORT,
  ASSET_PORT: process.env.ASSET_PORT,
};