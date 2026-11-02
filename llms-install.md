# Installing the Contentrain MCP server

Instructions for an AI agent (such as Cline) that sets up the Contentrain MCP server for a user.

## What it is

`@contentrain/mcp` is a local MCP server, run with `npx` over stdio. It gives the agent tools to define content models and to read, write and validate content in the user's own Git repository, under `.contentrain/`. It needs no account, no API key and no hosted service.

## Prerequisites

- Node.js 22 or newer (`node --version`).
- Git, and a project that is a Git repository. This is the repository the content will live in.

## Steps

1. Ask the user which project the server should work on, and use that project's **absolute path**. Your MCP servers do not start in the user's project directory, so the server is told its project through `CONTENTRAIN_PROJECT_ROOT`. Do not guess the path.
2. Add this entry to your MCP settings file, `cline_mcp_settings.json` for Cline. Replace the path with the one from step 1:

   ```json
   {
     "mcpServers": {
       "contentrain": {
         "command": "npx",
         "args": ["-y", "@contentrain/mcp@^3"],
         "env": {
           "CONTENTRAIN_PROJECT_ROOT": "/absolute/path/to/the/project"
         },
         "disabled": false
       }
     }
   }
   ```

   On Windows, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@contentrain/mcp@^3"]`.
3. Save the file. The server starts on first use; the first `npx` run downloads the package.
4. Check that it works by calling the `contentrain_status` tool. It answers with the project's state. A project that has never used Contentrain reports that it is not initialized, which is expected.
5. If the user wants to start using Contentrain in that project, call `contentrain_init`. It creates the `.contentrain/` structure and its Git setup.

## Notes

- Write tools work on isolated `cr/*` branches in the user's repository. Destructive tools (deletes) need `confirm: true`.
- To use it for another project, add a second entry with a different name and path.
- Documentation: https://ai.contentrain.io/packages/mcp
