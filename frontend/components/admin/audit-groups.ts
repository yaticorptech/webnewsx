/** Audit log filter groups: `value` is the action prefix sent as `?action=` (shared by the page and the view). */
export const AUDIT_GROUPS = [
  { value: "all", label: "Everything" },
  { value: "review.", label: "Review Desk" },
  { value: "story.", label: "Stories" },
  { value: "flags.", label: "Flags" },
  { value: "reporter.", label: "Reporters" },
  { value: "user.", label: "People" },
  { value: "spotlight.", label: "Spotlight" },
  { value: "press_meet.", label: "Press meets" },
] as const;
