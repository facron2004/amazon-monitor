export type AppViewStateKind = "loading" | "error" | "content";

export function resolveAppViewState(loading: boolean, error: string): AppViewStateKind {
  if (loading) return "loading";
  if (error) return "error";
  return "content";
}
