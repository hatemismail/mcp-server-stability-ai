import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
export async function runStdioServer(server) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("stability-ai MCP Server running on stdio");
}
