import { useMemo } from "react";
import { summarizePerformanceBuckets } from "../services/adaptiveInsights";

export function useAdaptiveInsights(reviewSessions) {
  return useMemo(() => summarizePerformanceBuckets(reviewSessions), [reviewSessions]);
}
