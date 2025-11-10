import 'dotenv/config';
import {createMcpServer} from './servers/mcpServer.mjs';

async function main() {
  await createMcpServer();
}
main();
console.log(process.env.ENV_MSG);
