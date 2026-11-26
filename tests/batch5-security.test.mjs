import test from "node:test";
import assert from "node:assert/strict";
import { splitStatements } from "../js/core/cards.mjs";

test("batch5 truncation never splits an emoji surrogate pair", () => {
  const source = "a" + "🙂".repeat(90) + " is important enough to keep.";
  const statement = splitStatements(source)[0];
  assert.ok(statement);
  const lone = Array.from(statement.excerpt).some((ch) => ch.length === 1 && /[\uD800-\uDFFF]/.test(ch));
  assert.equal(lone, false);
});
