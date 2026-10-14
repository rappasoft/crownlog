import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const run = promisify(execFile);
const project = fileURLToPath(new URL("..", import.meta.url));
const platform = process.env.DOCKER_PLATFORM;
const platformArgs = platform ? ["--platform", platform] : [];

async function docker(...args) {
  const { stdout } = await run("docker", args, { cwd: project, timeout: 600_000, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function api(origin, path, method = "GET", body) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`);
  return response.json();
}

async function start(container, volume, image) {
  await docker("run", ...platformArgs, "--detach", "--name", container, "--publish", "127.0.0.1::3000", "--mount", `type=volume,source=${volume},target=/app/data`, image);
  const address = await docker("port", container, "3000/tcp");
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const origin = `http://${address}`;
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await api(origin, "/api/watches");
      return origin;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  throw new Error(`Container did not become ready:\n${await docker("logs", container)}`, { cause: lastError });
}

test("Docker serves assets, persists watches, and restores JSON backups", { timeout: 900_000 }, async () => {
  const prefix = `crownlog-smoke-${randomUUID()}`;
  const image = `${prefix}:test`;
  const containers = [`${prefix}-first`, `${prefix}-replacement`, `${prefix}-restore`];
  const volumes = [`${prefix}-data`, `${prefix}-restore-data`];

  try {
    await docker("info");
    await docker("build", ...platformArgs, "--tag", image, ".");
    if (platform) {
      assert.equal(await docker("image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", image), platform);
    }
    let origin = await start(containers[0], volumes[0], image);
    assert.deepEqual((await api(origin, "/api/watches")).watches, []);

    const { watch } = await api(origin, "/api/watches", "POST", {
      brand: "Docker Smoke Test",
      model: "Persistent Watch",
      status: "wishlist",
      isFavorite: true,
      currentPrice: "123.45",
      currency: "USD",
    });
    assert.equal(watch.isFavorite, true);
    assert.equal(watch.currentPriceCents, 12345);
    assert.equal(watch.priceHistory.length, 1);
    assert.equal(watch.priceHistory[0].priceCents, 12345);

    const response = await fetch(origin, { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Crownlog/);
    const stylesheet = html.match(/href="([^"]+\.css(?:\?[^"]*)?)"/)?.[1];
    const script = html.match(/(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/)?.[1];
    assert.ok(stylesheet, "HTML includes a stylesheet");
    assert.ok(script, "HTML includes a JavaScript asset");
    for (const [path, contentType] of [[stylesheet, /text\/css/], [script, /javascript/], ["/crownlog-mark.png", /image\/png/], ["/favicon.svg", /image\/svg\+xml/]]) {
      const asset = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(10_000) });
      assert.equal(asset.status, 200, path);
      assert.match(asset.headers.get("content-type") || "", contentType, path);
      assert.ok((await asset.arrayBuffer()).byteLength > 0, path);
    }

    await docker("stop", containers[0]);
    await docker("rm", containers[0]);
    origin = await start(containers[1], volumes[0], image);
    assert.deepEqual((await api(origin, "/api/watches")).watches, [watch]);

    const backup = await api(origin, "/api/backups");
    assert.equal(backup.format, "crownlog-backup");
    assert.equal(backup.version, 1);
    assert.deepEqual(backup.watches, [watch]);

    const restoredOrigin = await start(containers[2], volumes[1], image);
    assert.deepEqual((await api(restoredOrigin, "/api/watches")).watches, []);
    const result = await api(restoredOrigin, "/api/backups", "POST", backup);
    assert.equal(result.restored.watches, 1);
    assert.equal(result.restored.prices, 1);
    assert.deepEqual((await api(restoredOrigin, "/api/watches")).watches, [watch]);
  } finally {
    await Promise.allSettled(containers.map((container) => docker("rm", "--force", container)));
    await Promise.allSettled(volumes.map((volume) => docker("volume", "rm", volume)));
    await docker("image", "rm", "--force", image).catch(() => {});
  }
});
