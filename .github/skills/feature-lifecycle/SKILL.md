---
name: feature-lifecycle
description: Finalizes an approved implementation plan as a documented repository feature. Use immediately after a plan is accepted or when asked to create, register, or document a feature from an approved plan.
---

# Feature lifecycle

Apply this workflow only after the user has accepted the implementation plan.
Do not use it for drafts, exploratory notes, or rejected plans.

## Required outcome

For every approved plan, create exactly one feature directory:

```text
features/<feature-name>/README.md
```

`<feature-name>` must be a lowercase kebab-case identifier. The directory name and
Git branch name must be identical.

The feature README is the durable, feature-local implementation plan. It must retain
the approved plan's scope, decisions, implementation steps, acceptance criteria,
constraints, and validation strategy. Do not merely link to the session plan because
session files are not repository artifacts.

## Workflow

1. Determine the feature name from the accepted plan title. Normalize it to lowercase
   kebab-case. If normalization would be ambiguous, the plan already names multiple
   independent features, or the user supplied a conflicting name, ask the user to
   choose one name before making changes.
2. Confirm the workspace is a Git repository and inspect the current branch and
   working tree without changing it. If it is not a Git repository, explain that the
   requested branch cannot be created and stop before creating feature documentation.
3. Before making changes, verify that neither `features/<feature-name>/` nor a local
   branch named `<feature-name>` already exists. On a collision, stop and ask whether
   to reuse the existing feature or choose a different name. Never overwrite an
   existing feature README or branch.
4. Create and switch to the branch named `<feature-name>` from the current branch.
   Do not use a branch prefix such as `feature/`. Preserve unrelated working-tree
   changes; do not reset, stash, or discard them.
5. Create `features/<feature-name>/README.md` using the approved plan as its content.
   Start it with the feature name as the H1 heading, then organize the plan under
   meaningful headings such as Goal, Scope, Decisions, Implementation plan,
   Acceptance criteria, and Validation. Include any user decisions made while
   refining the plan.
6. Update the root `README.md` on every new feature. Maintain a `## Features` section
   with one concise entry per feature, sorted by feature-directory name, linking to
   `features/<feature-name>/README.md`. Add the section if it does not exist. Keep
   all unrelated README content intact and update the product description only when
   the approved feature changes it.
7. Verify the branch name, feature README path, and root README link. Report those
   paths and the branch name. Do not implement the feature itself unless explicitly
   asked.

## Documentation rules

- Do not copy transient implementation details such as local session paths into the
  feature README.
- Record concrete decisions rather than unresolved alternatives. If essential
  decisions remain unresolved, ask before finalizing the feature.
- Feature documentation must describe the expected final behavior, not claim that
  unimplemented behavior already exists.
- A plan update made after feature finalization must update that same feature README
  and root README entry rather than create a second feature directory.
