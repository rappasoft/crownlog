import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const braces = require("../vendor/braces");
const depthError = { name: "RangeError", message: "Pattern nesting exceeds max depth (100)" };

test("vendored braces preserves public compilation, expansion, ranges, and AST APIs", () => {
  const pattern = "src/{a,{b,c}}.{js,ts}";
  const compiled = "src/(a|(b|c)).(js|ts)";
  const expanded = ["src/a.js", "src/a.ts", "src/b.js", "src/b.ts", "src/c.js", "src/c.ts"];
  assert.deepEqual(braces(pattern), [compiled]);
  assert.equal(braces.create(pattern), compiled);
  assert.equal(braces.compile(braces.parse(pattern)), compiled);
  assert.equal(braces.stringify(braces.parse(pattern)), pattern);
  assert.deepEqual(braces.expand(braces.parse(pattern)), expanded);
  assert.deepEqual(braces(pattern, { expand: true }), expanded);
  assert.deepEqual(braces(["{a,b}", "{b,c}"], { expand: true, nodupes: true }), ["a", "b", "c"]);
  assert.deepEqual(braces.expand("{,a,a,b}", { nodupes: true, noempty: true }), ["a", "b"]);
  assert.deepEqual(braces.expand("{01..03}"), ["01", "02", "03"]);
  assert.deepEqual(braces.expand("{a..c}"), ["a", "b", "c"]);
  assert.deepEqual(braces.expand("(a){x,y}"), ["(a)x", "(a)y"]);
  assert.deepEqual(braces.expand("${a,b}"), ["${a,b}"]);
  assert.deepEqual(braces.expand("{literal}"), ["{literal}"]);
  assert.throws(() => braces.expand("{1..1001}"), /exceeds range limit/);
});

test("vendored braces does not count escaped, quoted, or bracketed nesting", () => {
  const literal = "{(".repeat(200) + "a,b" + ")}".repeat(200);
  const escaped = "\\{\\(".repeat(200) + "a,b" + "\\)\\}".repeat(200);
  assert.deepEqual(braces.expand(escaped), [literal]);
  assert.equal(braces.stringify(escaped, { keepEscaping: true }), escaped);
  for (const quote of ['"', "'", "`"]) {
    assert.deepEqual(braces.expand(`${quote}${literal}${quote}`), [literal]);
    assert.equal(braces.stringify(`${quote}${literal}${quote}`, { keepQuotes: true }), `${quote}${literal}${quote}`);
  }
  assert.deepEqual(braces.expand(`[${literal}]`), [`[${literal}]`]);
  assert.deepEqual(braces.expand('"a\\"{b,c}"'), ['a\\"{b,c}']);
});

test("vendored braces allows 100 nested blocks and independent shallow siblings", () => {
  for (const [open, close] of [["{", "}"], ["(", ")"], ["({", "})"]]) {
    const count = open.length === 1 ? 100 : 50;
    const pattern = open.repeat(count) + "a" + close.repeat(count);
    const ast = braces.parse(pattern);
    assert.equal(braces.stringify(ast), pattern);
    assert.equal(braces.compile(ast), pattern);
    assert.deepEqual(braces.expand(ast), [pattern]);
  }
  const siblings = "{literal}".repeat(150);
  assert.equal(braces.compile(siblings), siblings);
  assert.deepEqual(braces.expand(siblings), [siblings]);
});

test("vendored braces rejects the advisory PoC and excessive brace or parenthesis nesting", () => {
  const patterns = [
    "{".repeat(4000) + "a" + "}".repeat(4000),
    "(".repeat(4000) + "a" + ")".repeat(4000),
    "{".repeat(101) + "a" + "}".repeat(101),
    "(".repeat(51) + "{".repeat(50) + "a,b" + "}".repeat(50) + ")".repeat(51),
    "{".repeat(101),
    "(".repeat(101),
  ];
  for (const pattern of patterns) {
    assert.ok(pattern.length <= 10000);
    for (const method of [braces, braces.parse, braces.create, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => method(pattern), depthError);
    }
    assert.throws(() => braces(pattern, { expand: true }), depthError);
  }
});

test("vendored braces rejects overdeep caller-provided ASTs in every recursive walker", () => {
  for (const method of [braces, braces.create, braces.compile, braces.expand, braces.stringify]) {
    const ast = braces.parse("a");
    let node = ast;
    for (let depth = 0; depth < 4000; depth += 1) {
      const child = { type: "paren", parent: node, nodes: [] };
      node.nodes = [child];
      node = child;
    }
    node.nodes = [{ type: "text", value: "a" }];
    assert.throws(() => method(ast), depthError);
  }
});

test("installed micromatch and fast-glob use the patched braces without changing ordinary globs", () => {
  const micromatch = require("micromatch");
  const fastGlob = require("fast-glob");
  assert.deepEqual(micromatch.braces("src/{a,{b,c}}.{js,ts}"), ["src/(a|(b|c)).(js|ts)"]);
  assert.equal(micromatch.parse("src/{a,b}.js")[0].input, "src/(a|b).js");
  const tasks = fastGlob.generateTasks("src/{a,{b,a},}.{js,ts}");
  assert.deepEqual(tasks.flatMap((task: { positive: string[] }) => task.positive), ["src/.js", "src/.ts", "src/a.js", "src/a.ts", "src/b.js", "src/b.ts"]);
  const deepBraces = "{".repeat(4000) + "a" + "}".repeat(4000);
  const deepParens = "(".repeat(4000) + "a" + ")".repeat(4000);
  assert.throws(() => micromatch.braces(deepBraces), depthError);
  assert.throws(() => micromatch.braceExpand(deepBraces), depthError);
  assert.throws(() => micromatch.parse(deepParens), depthError);
  assert.throws(() => fastGlob.generateTasks(deepBraces), depthError);
  assert.throws(() => fastGlob.generateTasks("src/*.ts", { ignore: [deepBraces] }), depthError);
});
