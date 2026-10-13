// Local Crowbo MCP server over stdio for Claude Code: the programme prioritisation tools on the
// synthetic Northstar fixture. No network, no credentials, no storage; every result is a simulation.
// Usage: bun backend/scripts/mcp-local.ts   (Claude Code starts it from the repo's .mcp.json)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fixture from "../../proof/fixtures/programme.json";
import { PROGRAMME_INSTRUCTIONS, registerProgrammeTools } from "../src/programme/tools";

const server = new McpServer({ name: "Crowbo (local, synthetic)", version: "0.3.0" }, { instructions: PROGRAMME_INSTRUCTIONS });
registerProgrammeTools(server, structuredClone(fixture));
await server.connect(new StdioServerTransport());
