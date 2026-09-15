# Enrich Layer MCP Server

An MCP (Model Context Protocol) server that provides 25 tools for enriching company, person, contact, school, and job data via the [Enrich Layer API](https://enrichlayer.com/docs?utm_source=mcp&utm_medium=integration&utm_campaign=docs).

Use it with any MCP-compatible client: Claude.ai, Claude Desktop, Cowork, Claude Code, Cursor, VS Code, ChatGPT, and more.

## Hosted connector (recommended)

The server runs as a hosted remote MCP endpoint with OAuth, so nothing needs to be installed:

```
https://mcp.enrichlayer.com/mcp
```

Sign in with your Enrich Layer API key once; access tokens refresh automatically after that. Get a key at [enrichlayer.com/dashboard](https://enrichlayer.com/dashboard?utm_source=mcp&utm_medium=integration&utm_campaign=dashboard).

| Client | How to connect |
|--------|----------------|
| Claude.ai, Claude Desktop, Cowork | **Customize → Connectors → Add custom connector**, name it `Enrich Layer`, paste the URL, click **Add**, then **Connect** and paste your API key. Team and Enterprise owners add it under **Organization settings → Connectors → Add → Custom → Web**; members then click **Connect**. |
| Claude Code | `claude mcp add --transport http enrich-layer https://mcp.enrichlayer.com/mcp`, then type `/mcp` and pick Enrich Layer to sign in. Add `--scope user` to make it available in every project. |
| Cursor | `.cursor/mcp.json`: `{"mcpServers":{"enrich-layer":{"url":"https://mcp.enrichlayer.com/mcp"}}}` |
| VS Code | `.vscode/mcp.json`: `{"servers":{"enrich-layer":{"type":"http","url":"https://mcp.enrichlayer.com/mcp"}}}` |
| ChatGPT | **Settings → Connectors → Advanced → Developer mode**, then **Create**, paste the URL, keep OAuth as the authentication, and connect with your API key. |

Any client that implements the MCP authorization flow (OAuth 2.1 with PKCE, dynamic client registration or client ID metadata documents) works the same way.

## Local server (npx)

Prefer to run the server on your own machine (for example with a client that cannot reach remote servers)? It also ships as a stdio server:

```bash
npx -y @enrichlayer/mcp-server
```

Set your API key as an environment variable:

```bash
export ENRICH_LAYER_API_KEY=your_api_key_here
```

Get your API key at [enrichlayer.com/dashboard](https://enrichlayer.com/dashboard?utm_source=mcp&utm_medium=integration&utm_campaign=dashboard).

## Local client configuration

### Claude Desktop

Add to your `claude_desktop_config.json` (or use the hosted connector above — no config file needed):

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

`manifest.json` describes the server as a Desktop Extension. Build the bundle from a checkout and open it in Claude Desktop, which prompts for your API key during setup:

```bash
npm install && npm run build
npx @anthropic-ai/mcpb pack   # produces enrich-layer.mcpb in the current directory
```

Most Desktop users should simply add the hosted connector instead.

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

The hosted connector at `mcp.enrichlayer.com` is this same package running the Streamable HTTP transport behind an OAuth 2.1 authorization server:

```bash
npm run start:http
```

| Environment variable | Purpose |
|----------------------|---------|
| `PORT` | Listen port (default `3000`). |
| `AUTH_BASE_URL` | Issuer URL of the authorization server; must equal the `iss` claim it signs. |
| `MCP_BASE_URL` | Public origin of this server. The advertised resource identifier is `${MCP_BASE_URL}/mcp`. |
| `AUTH_JWT_SECRET` | HS256 secret shared with the authorization server. |

Endpoints:

| Endpoint | Behaviour |
|----------|-----------|
| `POST /mcp` | JSON-RPC over Streamable HTTP (stateless). Requires `Authorization: Bearer <access token>`. |
| `GET` / `DELETE /mcp` | `405 Method Not Allowed` — no server-initiated stream and no sessions to terminate. |
| `GET /.well-known/oauth-protected-resource` and `.../oauth-protected-resource/mcp` | RFC 9728 protected-resource metadata: `resource` (`${MCP_BASE_URL}/mcp`), `authorization_servers` (`AUTH_BASE_URL`), `scopes_supported` (`api`). |
| `GET /health` | `{ status, server, version }`. |

Access tokens are HS256 JWTs minted by the authorization server (the `apps/auth` app in the Enrich Layer web platform) with `iss` = `AUTH_BASE_URL`, `aud` = `${MCP_BASE_URL}/mcp` (the bare origin is accepted too), `sub` = OAuth client id, `api_key` = the user's Enrich Layer API key, and `scope` = `api`. Tokens without the expected `aud` or `iss`, expired tokens, and malformed tokens receive `401` with a `WWW-Authenticate` challenge that points clients at the protected-resource metadata, which is what triggers the OAuth flow (or a token refresh) in Claude and other MCP clients. The API key never leaves the server: tool calls use it against `https://enrichlayer.com` over HTTPS.

### Optional Sentry self-reporting

The server captures startup, request, and graceful-shutdown failures when
`SENTRY_DSN` is configured. Set `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and
`SENTRY_SERVICE` alongside it to control the event tags. The defaults are the
current `NODE_ENV`, the package version, and `enrich-layer-mcp-server` for HTTP
or `enrich-layer-mcp-server-stdio` for stdio; the environment variables always
take precedence over those defaults. Missing or invalid DSNs disable reporting
without affecting server startup. Failure telemetry is scrubbed before it is
sent: request query strings are removed, credential-like values are redacted,
and default PII and tracing integrations are disabled. Error text may still be
forwarded after scrubbing, so configure this only where that operational
telemetry is permitted.

The application does not load an environment file. A deployment/runtime
manager must export these variables or inject them through its secret store;
never commit a DSN to source or pass it in a request. For the production
`mcp.verticalint.co` deployment, Vault injection and rollout are tracked
separately in [INF-887](https://linear.app/verticalint/issue/INF-887/inject-sentry-dsn-into-the-deployed-mcp-server).

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

Enrich Layer collects only the data you explicitly pass as tool parameters (URLs, names, emails). No conversation data or chat history is collected by the
MCP transport, and all API requests go directly to the Enrich Layer API over
HTTPS. When optional Sentry self-reporting is configured, scrubbed operational
failure telemetry may be sent to the configured Sentry project; it is separate
from the API request path and can be disabled by omitting `SENTRY_DSN`.

For the full privacy policy, see [enrichlayer.com/privacy-policy](https://enrichlayer.com/privacy-policy).

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

## API surface conformance

Tool schemas follow the published Enrich Layer OpenAPI spec — the single
source of truth for the API surface:
<https://enrichlayer.com/docs/api/v2/openapi.yaml>

A copy of the spec is vendored at `spec/enrichlayer-api.yaml`, and CI runs
`npm run check:spec` on every pull request. A tool fails the check when:

- its endpoint is not in the spec;
- it exposes a parameter the spec does not document for that endpoint;
- a parameter's required/optional flag disagrees with the spec;
- it omits a parameter the spec marks required.

Optional spec parameters a tool does not expose are reported as warnings —
tools may deliberately expose a curated subset. The check matches parameter
**names and required-ness only**; it does not validate enum values or types,
because the spec does not encode those for query parameters.

When the API changes:

```bash
npm run update-spec    # refresh spec/enrichlayer-api.yaml from the published URL
npm run build
npm run check:spec     # see which tools drifted, fix their schemas
```

The conformance logic lives in `scripts/conformance-core.mjs` and is unit-tested
(`npm test`, Node's built-in test runner).

## License

MIT
