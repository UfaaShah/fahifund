import { useMemo } from "react";
import { useFunds } from "./queries";
import type { FundOverview } from "./types";

/** Picks the "primary" fund to show on a dashboard/chooser: the first ACTIVE
 * fund, falling back to the first fund of any status. */
export function usePrimaryFund() {
  const query = useFunds();
  const primary = useMemo<FundOverview | undefined>(() => {
    if (!query.data) return undefined;
    return query.data.find((f) => f.fund.status === "ACTIVE") || query.data[0];
  }, [query.data]);
  return { ...query, primary };
}
