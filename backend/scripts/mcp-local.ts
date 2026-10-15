// Local Crowbo MCP server over stdio for Claude Code: the engine on demo data built on a case a
// future customer raised, and the programme prioritisation tools on the synthetic Northstar fixture.
// Models: Clef for ingestion and GLM-5.3-flash (or Haiku 5.5) for answering when their keys are in the
// environment or Keychain; without them it runs offline and every output says so. Nothing is sent.
// Usage: bun backend/scripts/mcp-local.ts   (Claude Code starts it from the repo's .mcp.json)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fixture from "../../proof/fixtures/programme.json";
import { localModels, startDemo } from "../src/engine/demo";
import { runEngine } from "../src/engine/port";
import { CROW_ICON_INLINE, CROW_ICON_URL, ENGINE_INSTRUCTIONS, registerEngineTools } from "../src/engine/tools";
import { PROGRAMME_INSTRUCTIONS, registerProgrammeTools } from "../src/programme/tools";

const server = new McpServer(
  { name: "Crowbo (local, demo data)", version: "0.6.0", icons: [CROW_ICON_URL, CROW_ICON_INLINE] },
  { instructions: `${ENGINE_INSTRUCTIONS} ${PROGRAMME_INSTRUCTIONS}` },
);
const { ai, ingestModel, answerer } = localModels(process.env);
let { engine } = await startDemo(ai, ingestModel, answerer);
registerEngineTools(server, async (op, args) => {
  if (op !== "reset") return runEngine(engine, "you (local)", op, args);
  if ((args as { confirm?: unknown } | null)?.confirm !== true) throw new Error("Pass confirm: true to reset this copy");
  ({ engine } = await startDemo(ai, ingestModel, answerer));
  return { reset: true };
});
registerProgrammeTools(server, structuredClone(fixture));
await server.connect(new StdioServerTransport());
