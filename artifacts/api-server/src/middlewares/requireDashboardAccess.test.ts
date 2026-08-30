import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAdminSelfRoleChange } from "./requireDashboardAccess";

describe("administrator role safeguards", () => {
  it("rejects an administrator removing their own dashboard access", () => {
    assert.equal(
      isAdminSelfRoleChange("user-admin", "admin", "user-admin", null),
      true,
    );
  });

  it("rejects an administrator downgrading their own role", () => {
    assert.equal(
      isAdminSelfRoleChange("user-admin", "admin", "user-admin", "editor"),
      true,
    );
    assert.equal(
      isAdminSelfRoleChange("user-admin", "admin", "user-admin", "viewer"),
      true,
    );
  });

  it("allows an administrator to keep their own administrator role", () => {
    assert.equal(
      isAdminSelfRoleChange("user-admin", "admin", "user-admin", "admin"),
      false,
    );
  });

  it("allows an administrator to update another user's role", () => {
    assert.equal(
      isAdminSelfRoleChange("user-admin", "admin", "user-other", null),
      false,
    );
    assert.equal(
      isAdminSelfRoleChange("user-admin", "admin", "user-other", "viewer"),
      false,
    );
  });
});