import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as registerCompany } from "./tools/company.js";
import { register as registerPerson } from "./tools/person.js";
import { register as registerContact } from "./tools/contact.js";
import { register as registerSchool } from "./tools/school.js";
import { register as registerJob } from "./tools/job.js";
import { register as registerSearch } from "./tools/search.js";
import { register as registerMeta } from "./tools/meta.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "enrich-layer",
    version: "0.2.0",
  });

  registerCompany(server);
  registerPerson(server);
  registerContact(server);
  registerSchool(server);
  registerJob(server);
  registerSearch(server);
  registerMeta(server);

  return server;
}
