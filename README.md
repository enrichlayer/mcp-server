# Enrich Layer MCP Server

An MCP (Model Context Protocol) server that provides 25 tools for enriching company, person, contact, school, and job data via the [Enrich Layer API](https://enrichlayer.com/docs?utm_source=mcp&utm_medium=integration&utm_campaign=docs).

Use it with any MCP-compatible client: Claude Desktop, Claude Code, Cursor, VS Code, and more.

## Quick Start

```bash
npx -y @enrichlayer/mcp-server
```

Set your API key as an environment variable:

```bash
export ENRICH_LAYER_API_KEY=your_api_key_here
```

Get your API key at [enrichlayer.com/dashboard](https://enrichlayer.com/dashboard?utm_source=mcp&utm_medium=integration&utm_campaign=dashboard).

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "enrich-layer": {
      "command": "npx",
      "args": ["-y", "@enrichlayer/mcp-server"],
      "env": {
        "ENRICH_LAYER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Desktop (MCPB Extension)

Download the `.mcpb` file from [Releases](https://github.com/enrichlayer/mcp-server/releases) and open it in Claude Desktop. You'll be prompted to enter your API key during setup.

### Claude Code

```bash
claude mcp add enrich-layer -- npx -y @enrichlayer/mcp-server
```

Then set the env var `ENRICH_LAYER_API_KEY` in your shell.

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "enrich-layer": {
      "command": "npx",
      "args": ["-y", "@enrichlayer/mcp-server"],
      "env": {
        "ENRICH_LAYER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### VS Code

Add to your VS Code MCP settings (`.vscode/mcp.json`):

```json
{
  "servers": {
    "enrich-layer": {
      "command": "npx",
      "args": ["-y", "@enrichlayer/mcp-server"],
      "env": {
        "ENRICH_LAYER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Remote HTTP Server

For remote deployments, the server also supports Streamable HTTP transport:

```bash
npm run start:http
```

This starts an Express server on port 3000 (configurable via `PORT` env var) with a `/mcp` endpoint for JSON-RPC and a `/health` endpoint for health checks.

## Usage Examples

### 1. Look up a company

> "Look up the company profile for Stripe"

This calls `enrich_company_lookup` with `company_name: "Stripe"` to find the company's professional network URL and profile data.

### 2. Find a work email by role

> "Find the work email for the CTO of Notion"

This chains two tools: first `enrich_role_lookup` with `company_name: "Notion", role: "cto"` to find the person, then `enrich_work_email` with their profile URL to get the email address.

### 3. Check your credit balance

> "How many credits do I have left?"

This calls `enrich_credit_balance` to show your remaining API credits. Costs 0 credits.

## Available Tools (25)

### Company (7 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `enrich_company_profile` | Get structured company data from URL | 1 |
| `enrich_company_lookup` | Look up company by name or domain | 2 |
| `enrich_company_id_lookup` | Look up company by numeric ID | 0 |
| `enrich_company_picture` | Get company profile picture URL | 0 |
| `enrich_employee_list` | List employees of a company | 3/employee |
| `enrich_employee_count` | Get employee count | 1 |
| `enrich_employee_search` | Search employees by keyword | 10 |

### Person (4 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `enrich_person_profile` | Get structured person data from URL | 1 |
| `enrich_person_lookup` | Look up person by name + company | 2 |
| `enrich_person_picture` | Get person profile picture URL | 0 |
| `enrich_role_lookup` | Find person by role at company | 3 |

### Contact (6 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `enrich_reverse_email` | Find profile by email | 3 |
| `enrich_reverse_phone` | Find profile by phone number | 3 |
| `enrich_work_email` | Get work email from profile | 3 |
| `enrich_personal_contact` | Get personal phone numbers | 1/contact |
| `enrich_personal_email` | Get personal email addresses | 1/email |
| `enrich_disposable_email` | Check if email is disposable | 0 |

### School (2 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `enrich_school_profile` | Get structured school data | 1 |
| `enrich_student_list` | List students of a school | 3/student |

### Job (3 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `enrich_job_profile` | Get structured job posting data | 2 |
| `enrich_job_search` | Search job postings | 2 |
| `enrich_job_count` | Count matching job postings | 2 |

### Search (2 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `enrich_company_search` | Search companies by criteria | 3/URL |
| `enrich_person_search` | Search people by criteria | 3/URL |

### Meta (1 tool)

| Tool | Description | Credits |
|------|-------------|---------|
| `enrich_credit_balance` | Check your credit balance | 0 |

## Privacy Policy

Enrich Layer collects only the data you explicitly pass as tool parameters (URLs, names, emails). No conversation data, chat history, or personal data is collected or stored. All requests go directly to the Enrich Layer API over HTTPS.

For the full privacy policy, see [enrichlayer.com/privacy](https://enrichlayer.com/privacy).

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run stdio server (for MCP clients)
npm start

# Run HTTP server (for remote deployments)
npm run start:http

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node build/index.js
```

## License

MIT
