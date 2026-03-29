import { pathToFileURL } from "node:url";

import { startServer } from "./start-server.js";

async function main() {
  try {
    await startServer();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryUrl) {
  main();
}

export { startServer } from "./start-server.js";
