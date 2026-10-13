// Local Crowbo MCP server over stdio for Claude Code: the programme prioritisation tools on the
// synthetic Northstar fixture, and the engine prototype on the fictional Northwind company.
// No network, no credentials, no storage; every result is a simulation.
// Usage: bun backend/scripts/mcp-local.ts   (Claude Code starts it from the repo's .mcp.json)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fixture from "../../proof/fixtures/programme.json";
import { Engine } from "../src/engine/engine";
import { NORTHWIND, NORTHWIND_MODEL_LABELS } from "../src/engine/fixture";
import { ENGINE_INSTRUCTIONS, registerEngineTools } from "../src/engine/tools";
import { PROGRAMME_INSTRUCTIONS, registerProgrammeTools } from "../src/programme/tools";

const server = new McpServer({ name: "Crowbo (local, synthetic)", version: "0.4.0" }, { instructions: `${ENGINE_INSTRUCTIONS} ${PROGRAMME_INSTRUCTIONS}` });
registerEngineTools(server, new Engine(structuredClone(NORTHWIND), { modelLabels: NORTHWIND_MODEL_LABELS }));
registerProgrammeTools(server, structuredClone(fixture));
await server.connect(new StdioServerTransport());
