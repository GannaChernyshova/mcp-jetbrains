#!/usr/bin/env node
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, CallToolResult, ListToolsRequestSchema,} from "@modelcontextprotocol/sdk/types.js";

// Logging is enabled only if LOG_ENABLED environment variable is set to 'true'
const LOG_ENABLED = process.env.LOG_ENABLED === 'true';

const HOST = process.env.HOST ?? "127.0.0.1"

export function log(...args: any[]) {
    if (LOG_ENABLED) {
        console.error(...args);
    }
}

interface IDEResponseOk {
    status: string;
    error: null;
}

interface IDEResponseErr {
    status: null;
    error: string;
}

type IDEResponse = IDEResponseOk | IDEResponseErr;

interface Tool {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

// Store IDE-provided tools separately
let ideTools: Tool[] = [];

// Default list of tools that are always available
const DEFAULT_TOOLS: Tool[] = [
    {
        name: "create_new_file_with_text",
        description: "Creates a new file at the specified path within the project directory and populates it with the provided text",
        parameters: {
            type: "object",
            properties: {
                pathInProject: {
                    type: "string",
                    description: "The relative path where the file should be created"
                },
                text: {
                    type: "string",
                    description: "The content to write into the new file"
                }
            },
            required: ["pathInProject", "text"]
        }
    },
    {
        name: "execute_action_by_id",
        description: "Executes an action by its ID in JetBrains IDE editor",
        parameters: {
            type: "object",
            properties: {
                actionId: {
                    type: "string",
                    description: "The ID of the action to execute"
                }
            },
            required: ["actionId"]
        }
    },
    {
        name: "execute_terminal_command",
        description: "Executes a specified shell command in the IDE's integrated terminal",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "The shell command to execute"
                }
            },
            required: ["command"]
        }
    },
    {
        name: "find_commit_by_message",
        description: "Searches for a commit based on the provided text or keywords in the project history",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The text or keywords to search for in commit messages"
                }
            },
            required: ["query"]
        }
    },
    {
        name: "find_files_by_name_substring",
        description: "Searches for all files in the project whose names contain the specified substring",
        parameters: {
            type: "object",
            properties: {
                nameSubstring: {
                    type: "string",
                    description: "The substring to search for in file names"
                }
            },
            required: ["nameSubstring"]
        }
    },
    {
        name: "get_all_open_file_paths",
        description: "Lists full path relative paths to project root of all currently open files",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_all_open_file_texts",
        description: "Returns text of all currently open files in the JetBrains IDE editor",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_debugger_breakpoints",
        description: "Retrieves a list of all line breakpoints currently set in the project",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_file_text_by_path",
        description: "Retrieves the text content of a file using its path relative to project root",
        parameters: {
            type: "object",
            properties: {
                pathInProject: {
                    type: "string",
                    description: "The file location from project root"
                }
            },
            required: ["pathInProject"]
        }
    },
    {
        name: "get_open_in_editor_file_path",
        description: "Retrieves the absolute path of the currently active file",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_open_in_editor_file_text",
        description: "Retrieves the complete text content of the currently active file",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_progress_indicators",
        description: "Retrieves the status of all running progress indicators",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_project_dependencies",
        description: "Get list of all dependencies defined in the project",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_project_modules",
        description: "Get list of all modules in the project with their dependencies",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_project_vcs_status",
        description: "Retrieves the current version control status of files in the project",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_run_configurations",
        description: "Returns a list of run configurations for the current project",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_selected_in_editor_text",
        description: "Retrieves the currently selected text from the active editor",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_terminal_text",
        description: "Retrieves the current text content from the first active terminal",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "list_available_actions",
        description: "Lists all available actions in JetBrains IDE editor",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "list_directory_tree_in_folder",
        description: "Provides a hierarchical tree view of the project directory structure",
        parameters: {
            type: "object",
            properties: {
                pathInProject: {
                    type: "string",
                    description: "The starting folder path (use '/' for project root)"
                },
                maxDepth: {
                    type: "integer",
                    description: "Maximum recursion depth (default: 5)"
                }
            },
            required: ["pathInProject"]
        }
    },
    {
        name: "list_files_in_folder",
        description: "Lists all files and directories in the specified project folder",
        parameters: {
            type: "object",
            properties: {
                pathInProject: {
                    type: "string",
                    description: "The folder path (use '/' for project root)"
                }
            },
            required: ["pathInProject"]
        }
    },
    {
        name: "open_file_in_editor",
        description: "Opens the specified file in the JetBrains IDE editor",
        parameters: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description: "The path of file to open (can be absolute or relative)"
                }
            },
            required: ["filePath"]
        }
    },
    {
        name: "replace_current_file_text",
        description: "Replaces the entire content of the currently active file",
        parameters: {
            type: "object",
            properties: {
                text: {
                    type: "string",
                    description: "The new content to write"
                }
            },
            required: ["text"]
        }
    },
    {
        name: "replace_file_text_by_path",
        description: "Replaces the entire content of a specified file with new text",
        parameters: {
            type: "object",
            properties: {
                pathInProject: {
                    type: "string",
                    description: "The path to the target file, relative to project root"
                },
                text: {
                    type: "string",
                    description: "The new content to write"
                }
            },
            required: ["pathInProject", "text"]
        }
    },
    {
        name: "replace_selected_text",
        description: "Replaces the currently selected text in the active editor",
        parameters: {
            type: "object",
            properties: {
                text: {
                    type: "string",
                    description: "The replacement content"
                }
            },
            required: ["text"]
        }
    },
    {
        name: "replace_specific_text",
        description: "Replaces specific text occurrences in a file with new text",
        parameters: {
            type: "object",
            properties: {
                pathInProject: {
                    type: "string",
                    description: "The path to the target file, relative to project root"
                },
                oldText: {
                    type: "string",
                    description: "The text to be replaced"
                },
                newText: {
                    type: "string",
                    description: "The replacement text"
                }
            },
            required: ["pathInProject", "oldText", "newText"]
        }
    },
    {
        name: "run_configuration",
        description: "Run a specific run configuration in the current project",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name of the run configuration to execute"
                }
            },
            required: ["name"]
        }
    },
    {
        name: "search_in_files_content",
        description: "Searches for a text substring within all files in the project",
        parameters: {
            type: "object",
            properties: {
                searchText: {
                    type: "string",
                    description: "The text to find"
                }
            },
            required: ["searchText"]
        }
    },
    {
        name: "toggle_debugger_breakpoint",
        description: "Toggles a debugger breakpoint at the specified line in a project file",
        parameters: {
            type: "object",
            properties: {
                filePathInProject: {
                    type: "string",
                    description: "The relative path to the file within the project"
                },
                line: {
                    type: "integer",
                    description: "The line number where to toggle the breakpoint (1-based)"
                }
            },
            required: ["filePathInProject", "line"]
        }
    },
    {
        name: "wait",
        description: "Waits for a specified number of milliseconds",
        parameters: {
            type: "object",
            properties: {
                milliseconds: {
                    type: "integer",
                    description: "The duration to wait in milliseconds (default: 5000)"
                }
            }
        }
    }
];

/**
 * Globally store the cached IDE endpoint.
 * We'll update this once at the beginning and every 10 seconds.
 */
let cachedEndpoint: string | null = null;

/**
 * If you need to remember the last known response from /mcp/list_tools, store it here.
 * That way, you won't re-check it every single time a new request comes in.
 */
let previousResponse: string | null = null;

/**
 * Helper to send the "tools changed" notification.
 */
function sendToolsChanged() {
    try {
        log("Sending tools changed notification.");
        server.notification({method: "notifications/tools/list_changed"});
    } catch (error) {
        log("Error sending tools changed notification:", error);
    }
}

/**
 * Test if /mcp/list_tools is responding on a given endpoint
 *
 * @returns true if working, false otherwise
 */
async function testListTools(endpoint: string): Promise<boolean> {
    log(`Sending test request to ${endpoint}/mcp/list_tools`);
    try {
        const res = await fetch(`${endpoint}/mcp/list_tools`);
        if (!res.ok) {
            log(`Test request to ${endpoint}/mcp/list_tools failed with status ${res.status}`);
            return false;
        }

        const currentResponse = await res.text();
        log(`Received response from ${endpoint}/mcp/list_tools: ${currentResponse.substring(0, 100)}...`);

        // If the response changed from last time, notify
        if (previousResponse !== null && previousResponse !== currentResponse) {
            log("Response has changed since the last check.");
            sendToolsChanged();
        }
        previousResponse = currentResponse;

        return true;
    } catch (error) {
        log(`Error during testListTools for endpoint ${endpoint}:`, error);
        return false;
    }
}

/**
 * Finds and returns a working IDE endpoint using IPv4 by:
 * 1. Checking process.env.IDE_PORT, or
 * 2. Scanning ports 63342-63352
 *
 * Throws if none found.
 */
async function findWorkingIDEEndpoint(): Promise<string> {
    log("Attempting to find a working IDE endpoint...");

    // 1. If user specified a port, just use that
    if (process.env.IDE_PORT) {
        log(`IDE_PORT is set to ${process.env.IDE_PORT}. Testing this port.`);
        const testEndpoint = `http://${HOST}:${process.env.IDE_PORT}/api`;
        if (await testListTools(testEndpoint)) {
            log(`IDE_PORT ${process.env.IDE_PORT} is working.`);
            return testEndpoint;
        } else {
            log(`Specified IDE_PORT=${process.env.IDE_PORT} but it is not responding correctly.`);
            throw new Error(`Specified IDE_PORT=${process.env.IDE_PORT} but it is not responding correctly.`);
        }
    }

    // 2. Reuse existing endpoint if it's still working
    if (cachedEndpoint != null && await testListTools(cachedEndpoint)) {
        log('Using cached endpoint, it\'s still working')
        return cachedEndpoint
    }

    // 3. Otherwise, scan a range of ports
    for (let port = 63342; port <= 63352; port++) {
        const candidateEndpoint = `http://${HOST}:${port}/api`;
        log(`Testing port ${port}...`);
        const isWorking = await testListTools(candidateEndpoint);
        if (isWorking) {
            log(`Found working IDE endpoint at ${candidateEndpoint}`);
            return candidateEndpoint;
        } else {
            log(`Port ${port} is not responding correctly.`);
        }
    }

    // If we reach here, no port was found
    previousResponse = "";
    log("No working IDE endpoint found in range 63342-63352");
    throw new Error("No working IDE endpoint found in range 63342-63352");
}

/**
 * Updates the list of tools from the IDE
 */
async function updateIDETools(endpoint: string) {
    try {
        log(`Fetching tools from IDE at ${endpoint}`);
        const toolsResponse = await fetch(`${endpoint}/mcp/list_tools`);
        if (toolsResponse.ok) {
            const response = await toolsResponse.json();
            if (Array.isArray(response.tools)) {
                ideTools = response.tools;
                log(`Updated IDE tools list with ${ideTools.length} tools`);
                // Notify that tools have changed
                sendToolsChanged();
            } else {
                log("IDE returned invalid tools format");
            }
        } else {
            log(`Failed to fetch tools from IDE: ${toolsResponse.status}`);
        }
    } catch (error) {
        log("Error updating IDE tools:", error);
    }
}

/**
 * Updates the cached endpoint by finding a working IDE endpoint.
 * This runs once at startup and then once every 10 seconds in runServer().
 */
async function updateIDEEndpoint() {
    try {
        const newEndpoint = await findWorkingIDEEndpoint();
        if (newEndpoint !== cachedEndpoint) {
            cachedEndpoint = newEndpoint;
            log(`Updated cachedEndpoint to: ${cachedEndpoint}`);
            // Update tools list when we get a new endpoint
            await updateIDETools(cachedEndpoint);
        }
    } catch (error) {
        // If we fail to find a working endpoint, keep the old one if it existed
        log("Failed to update IDE endpoint:", error);
    }
}

/**
 * Main MCP server
 */
const server = new Server(
    {
        name: "jetbrains/proxy",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {
                listChanged: true,
            },
            resources: {},
        },
        instructions: "You can interact with an JetBrains IntelliJ IDE and its features through this MCP (Model Context Protocol) server. The server provides access to various IDE tools and functionalities. " +
            "All requests should be formatted as JSON objects according to the Model Context Protocol specification."
    },

);

/**
 * Handles listing tools by returning default tools immediately
 * and updating the list asynchronously if IDE is connected
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    log("Handling ListToolsRequestSchema request.");
    
    // Return default tools immediately
    const tools = [...DEFAULT_TOOLS];
    
    // If we have a cached endpoint, try to get additional tools from IDE
    if (cachedEndpoint) {
        // Update tools asynchronously
        updateIDETools(cachedEndpoint).catch(error => {
            log("Error updating IDE tools:", error);
        });
    }
    
    log(`Returning ${tools.length} default tools`);
    return {tools};
});

/**
 * Handle calls to a specific tool by using the *cached* endpoint.
 */
async function handleToolCall(name: string, args: any): Promise<CallToolResult> {
    log(`Handling tool call: name=${name}, args=${JSON.stringify(args)}`);
    if (!cachedEndpoint) {
        // If no cached endpoint, we can't proceed
        throw new Error("No working IDE endpoint available.");
    }

    try {
        log(`ENDPOINT: ${cachedEndpoint} | Tool name: ${name} | args: ${JSON.stringify(args)}`);
        const response = await fetch(`${cachedEndpoint}/mcp/${name}`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(args),
        });

        if (!response.ok) {
            log(`Response failed with status ${response.status} for tool ${name}`);
            throw new Error(`Response failed: ${response.status}`);
        }

        // Parse the IDE's JSON response
        const {status, error}: IDEResponse = await response.json();
        log("Parsed response:", {status, error});

        const isError = !!error;
        const text = status ?? error;
        log("Final response text:", text);
        log("Is error:", isError);

        return {
            content: [{type: "text", text: text}],
            isError,
        };
    } catch (error: any) {
        log("Error in handleToolCall:", error);
        return {
            content: [{
                type: "text",
                text: error instanceof Error ? error.message : "Unknown error",
            }],
            isError: true,
        };
    }
}

// 1) Do an initial endpoint check (once at startup)
await updateIDEEndpoint();

/**
 * Request handler for "CallToolRequestSchema"
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    log("Handling CallToolRequestSchema request:", request);
    try {
        const result = await handleToolCall(request.params.name, request.params.arguments ?? {});
        log("Tool call handled successfully:", result);
        return result;
    } catch (error) {
        log("Error handling CallToolRequestSchema request:", error);
        throw error;
    }
});

/**
 * Starts the server, connects via stdio, and schedules endpoint checks.
 */
async function runServer() {
    log("Initializing server...");

    const transport = new StdioServerTransport();
    try {
        await server.connect(transport);
        log("Server connected to transport.");
    } catch (error) {
        log("Error connecting server to transport:", error);
        throw error;
    }

    // 2) Then check again every 10 seconds (in case IDE restarts or ports change)
    setInterval(updateIDEEndpoint, 10_000);
    log("Scheduled endpoint check every 10 seconds.");

    log("JetBrains Proxy MCP Server running on stdio");
}

// Start the server
runServer().catch(error => {
    log("Server failed to start:", error);
});