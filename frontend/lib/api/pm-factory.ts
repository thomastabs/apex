import { taigaAdapter } from "./taiga-adapter";
import type { ProjectManagementAdapter } from "./pm-types";

export function getPmAdapter(pmTool: "taiga" = "taiga"): ProjectManagementAdapter {
  return taigaAdapter;
}
