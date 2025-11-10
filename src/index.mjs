import 'dotenv/config';
import { createMcpServer } from './server/mcp.mjs';

async function main() {
  await createMcpServer();
}
main();
console.log(process.env.ENV_MSG);
