import test from "node:test";
import assert from "node:assert/strict";
import { createAdminSessionToken, validateAdminSessionToken } from "../src/session.ts";

test("creates and validates an admin session token", async () => {
  const secret = "super-secret";
  const token = await createAdminSessionToken(secret);

  assert.equal(await validateAdminSessionToken(token, secret), true);
  assert.equal(await validateAdminSessionToken(`${token}x`, secret), false);
});
