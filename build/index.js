#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as dotenv from "dotenv";
import { generateImage, generateImageToolDefinition, generateImageSD35, generateImageSD35ToolDefinition, removeBackground, removeBackgroundToolDefinition, outpaint, outpaintToolDefinition, searchAndReplace, searchAndReplaceToolDefinition, upscaleFast, upscaleFastToolDefinition, upscaleCreative, upscaleCreativeToolDefinition, controlSketch, controlSketchToolDefinition, listResources, listResourcesToolDefinition, searchAndRecolor, searchAndRecolorToolDefinition, replaceBackgroundAndRelight, replaceBackgroundAndRelightToolDefinition, controlStyle, controlStyleToolDefinition, controlStructure, controlStructureToolDefinition, } from "./tools/index.js";
import { initializeResourceClient, getResourceClient, } from "./resources/resourceClientFactory.js";
import { prompts, injectPromptTemplate } from "./prompts/index.js";
import { runSSEServer } from "./sse.js";
import { runStdioServer } from "./stdio.js";
dotenv.config();
if (!process.env.IMAGE_STORAGE_DIRECTORY) {
    if (process.platform === "win32") {
        // Windows
        process.env.IMAGE_STORAGE_DIRECTORY =
            "C:\\Windows\\Temp\\mcp-server-stability-ai";
    }
    else {
        // macOS or Linux
        process.env.IMAGE_STORAGE_DIRECTORY =
            "/tmp/tadasant-mcp-server-stability-ai";
    }
}
if (!process.env.STABILITY_AI_API_KEY) {
    throw new Error("STABILITY_AI_API_KEY is a required environment variable");
}
const server = new Server({
    name: "stability-ai",
    version: "0.0.1",
}, {
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
    },
});
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts: prompts.map((p) => ({
            name: p.name,
            description: p.description,
        })),
    };
});
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = prompts.find((p) => p.name === name);
    if (!prompt) {
        throw new Error(`Prompt not found: ${name}`);
    }
    const result = injectPromptTemplate(prompt.template, args);
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: result,
                },
            },
        ],
    };
});
server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const meta = request.params?._meta;
    const ipAddress = meta?.ip;
    const context = {
        requestorIpAddress: ipAddress,
    };
    const resourceClient = getResourceClient();
    const resources = await resourceClient.listResources(context);
    return {
        resources,
    };
});
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { _meta: meta } = request.params;
    const ipAddress = meta?.ip;
    const context = {
        requestorIpAddress: ipAddress,
    };
    const resourceClient = getResourceClient();
    const resource = await resourceClient.readResource(request.params.uri, context);
    return {
        contents: [resource],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args, _meta: meta } = request.params;
    const ipAddress = meta?.ip;
    const context = {
        requestorIpAddress: ipAddress,
    };
    try {
        switch (name) {
            case generateImageToolDefinition.name:
                return generateImage(args, context);
            case generateImageSD35ToolDefinition.name:
                return generateImageSD35(args, context);
            case removeBackgroundToolDefinition.name:
                return removeBackground(args, context);
            case outpaintToolDefinition.name:
                return outpaint(args, context);
            case searchAndReplaceToolDefinition.name:
                return searchAndReplace(args, context);
            case upscaleFastToolDefinition.name:
                return upscaleFast(args, context);
            case upscaleCreativeToolDefinition.name:
                return upscaleCreative(args, context);
            case controlSketchToolDefinition.name:
                return controlSketch(args, context);
            case listResourcesToolDefinition.name:
                return listResources(context);
            case searchAndRecolorToolDefinition.name:
                return searchAndRecolor(args, context);
            case replaceBackgroundAndRelightToolDefinition.name:
                return replaceBackgroundAndRelight(args, context);
            case controlStyleToolDefinition.name:
                return controlStyle(args, context);
            case controlStructureToolDefinition.name:
                return controlStructure(args, context);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(`Invalid arguments: ${error.errors
                .map((e) => `${e.path.join(".")}: ${e.message}`)
                .join(", ")}`);
        }
        throw error;
    }
});
// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            generateImageToolDefinition,
            generateImageSD35ToolDefinition,
            removeBackgroundToolDefinition,
            outpaintToolDefinition,
            searchAndReplaceToolDefinition,
            upscaleFastToolDefinition,
            upscaleCreativeToolDefinition,
            controlSketchToolDefinition,
            listResourcesToolDefinition,
            searchAndRecolorToolDefinition,
            replaceBackgroundAndRelightToolDefinition,
            controlStyleToolDefinition,
            controlStructureToolDefinition,
        ],
    };
});
function printUsage() {
    console.error("Usage: node build/index.js [--sse]");
    console.error("Options:");
    console.error("  --sse    Use SSE transport instead of stdio");
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--sse")) {
        printUsage();
        throw new Error("Invalid arguments");
    }
    const useSSE = args.includes("--sse");
    // Storage backend is selected independently of transport: if the four
    // GCS env vars are set, use GCS regardless of stdio/sse. Falls back to
    // the local filesystem otherwise. Upstream gated GCS on `--sse` only.
    const useGcs = Boolean(process.env.GCS_BUCKET_NAME &&
        process.env.GCS_PROJECT_ID &&
        process.env.GCS_CLIENT_EMAIL &&
        process.env.GCS_PRIVATE_KEY);
    const resourceClientConfig = useGcs
        ? {
            type: "gcs",
            gcsConfig: {
                privateKey: process.env.GCS_PRIVATE_KEY,
                clientEmail: process.env.GCS_CLIENT_EMAIL,
                projectId: process.env.GCS_PROJECT_ID,
                bucketName: process.env.GCS_BUCKET_NAME,
            },
        }
        : {
            type: "filesystem",
            imageStorageDirectory: process.env.IMAGE_STORAGE_DIRECTORY,
        };
    initializeResourceClient(resourceClientConfig);
    if (useSSE) {
        await runSSEServer(server);
    }
    else {
        await runStdioServer(server);
    }
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
