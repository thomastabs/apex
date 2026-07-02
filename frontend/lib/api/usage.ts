import { apiRequest } from "./client";
import type { AuthContext } from "./types";

export type ModelUsageRow = {
  model: string;
  provider: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

export type CallUsageRow = {
  call: string;
  calls: number;
  cost_usd: number;
};

export type DayUsageRow = {
  date: string;
  calls: number;
  cost_usd: number;
};

export type UsageSummary = {
  days: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_calls: number;
  by_model: ModelUsageRow[];
  by_call: CallUsageRow[];
  by_day: DayUsageRow[];
};

export function getUsageSummary(context: AuthContext, days = 30) {
  return apiRequest<UsageSummary>(`/api/usage/summary?days=${days}`, { context });
}
