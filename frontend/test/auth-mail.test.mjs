import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_MAIL_CODE_TTL_MINUTES,
  loginFormPhase,
  mailCodeExpired,
  parseAuthHash,
  remainingMailCodeMs,
  resetFormPhase,
} from "../test-out/authMail.js";

test("parseAuthHash reads confirm, login, reset and invite links", () => {
  assert.deepEqual(parseAuthHash("#/auth/confirm?token=abc"), { purpose: "confirm", token: "abc" });
  assert.deepEqual(parseAuthHash("#/auth/login-code?token=xyz"), { purpose: "login", token: "xyz" });
  assert.deepEqual(parseAuthHash("#/auth/reset?token=rst"), { purpose: "reset", token: "rst" });
  assert.deepEqual(parseAuthHash("#/auth/invite?token=inv"), { purpose: "invite", token: "inv" });
  assert.equal(parseAuthHash("#/card/"), null);
});

test("mail code TTL is 30 minutes and expires on the boundary", () => {
  assert.equal(DEFAULT_MAIL_CODE_TTL_MINUTES, 30);
  const started = 1_000_000;
  const ttl = 30;
  assert.equal(mailCodeExpired(started, ttl, started + 30 * 60 * 1000 - 1), false);
  assert.equal(mailCodeExpired(started, ttl, started + 30 * 60 * 1000), true);
  assert.equal(remainingMailCodeMs(started, ttl, started + 10 * 60 * 1000), 20 * 60 * 1000);
  assert.equal(remainingMailCodeMs(started, ttl, started + 40 * 60 * 1000), 0);
});

test("expired reset token returns the request-email form", () => {
  const started = 1_000_000;
  assert.equal(resetFormPhase("live-token", started, 30, started + 1_000), "set-password");
  assert.equal(resetFormPhase("live-token", started, 30, started + 30 * 60 * 1000), "request");
  assert.equal(resetFormPhase("", started, 30, started + 1_000), "request");
});

test("login-by-mail stays on the login tab and returns to request after expiry", () => {
  const started = 1_000_000;
  assert.equal(loginFormPhase(false, started, 30, started + 1_000), "password");
  assert.equal(loginFormPhase(true, null, 30, started + 1_000), "request");
  assert.equal(loginFormPhase(true, started, 30, started + 1_000), "enter-code");
  assert.equal(loginFormPhase(true, started, 30, started + 30 * 60 * 1000), "request");
});
