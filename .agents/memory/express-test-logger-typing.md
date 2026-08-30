---
name: Express test logger typing
description: TypeScript guidance for stubbing request logging in Express route tests.
---

When an Express route test stubs `req.log`, cast to a narrow request shape containing only the logger methods the test needs rather than intersecting with Express's full `Request` type.

**Why:** `pino-http` augments Express's `Request.log` with overloaded logger signatures, so a small test logger can fail typechecking even when its runtime behavior is correct.

**How to apply:** Keep the narrow cast local to the test middleware and capture only the log level, context, and message needed for assertions.