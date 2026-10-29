import { Skeleton } from "./ui";

/**
 * Every page reads live data, so each route has a loading.tsx re-exporting this: client navigations then show a
 * skeleton at once instead of waiting for the server. Index pages that have child routes (/, /accounts, /lists…)
 * sit in an (index) route group so their boundary is below the layout shared with those children.
 */
export default function RouteLoading() {
  return <Skeleton />;
}
