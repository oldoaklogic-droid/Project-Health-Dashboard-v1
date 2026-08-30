# API authentication

This project uses Replit-managed Clerk for development and production
authentication. Clerk keys are provisioned and rotated by Replit and must stay in
Replit Secrets; they must never be committed, printed, or copied into source.

Protected dashboard routes first require a valid Clerk session and then read the
Clerk user's `publicMetadata.dashboardRole`. The approved dashboard roles are
`viewer`, `editor`, and `admin`. Mutation routes require `editor` or `admin`;
running BQE data pulls requires `admin`.

Run the live, read-only authorization check while the API workflow is running:

```sh
pnpm --filter @workspace/api-server run smoke:auth
```

The command creates disposable Clerk users and sessions, verifies anonymous,
unapproved, viewer, editor, and admin behavior, and removes the test records. Its
editor/admin checks intentionally send a body that fails validation after
authorization so they can prove the mutation gate was passed without changing
project data. Output is limited to status codes and booleans; it never prints
session or BQE token values.