import { jiraAdapter } from "./jira-adapter";
import { taigaAdapter } from "./taiga-adapter";
import type { ProjectManagementAdapter } from "./pm-types";

export function getPmAdapter(pmTool: "taiga" | "jira" = "taiga"): ProjectManagementAdapter {
  return pmTool === "jira" ? jiraAdapter : taigaAdapter;
}
