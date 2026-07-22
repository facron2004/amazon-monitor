# Operations Workspace Design Reference

The current UI refresh uses `operations-command-center-apple-v3.png` as its
primary visual direction. `operations-command-center-v2.png` and
`operations-workspace-reference.png` remain as earlier references.

Implementation principles:

- Keep global context compact so operational data owns the viewport.
- Present summary, priority, action, and evidence in that order.
- Use neutral surfaces with system blue for commands and semantic colors only for status.
- Keep cards at an 8px radius or less and avoid decorative page sections.
- Preserve dense tables, visible freshness, and responsive navigation.

The current implementation is applied through the shared web theme and covers
the application shell, sidebar, compact command bar, overview KPI strip,
priority action workspace, risk context rail, tables, panels, and Action Center.

The v3 direction was generated with the image-generation plugin and emphasizes
native desktop precision, an action-first hierarchy, restrained surfaces, and
clearer enterprise information density.
