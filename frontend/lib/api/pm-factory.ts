import { taigaAdapter } from "./taiga-adapter";
import { planeAdapter } from "./plane-adapter";
import type { ProjectManagementAdapter } from "./pm-types";

export function getPmAdapter(pmTool: "taiga" | "plane" = "taiga"): ProjectManagementAdapter {
  return pmTool === "plane" ? planeAdapter : taigaAdapter;
}
