import test from "node:test";
import assert from "node:assert/strict";
// The dependency-free module is uploaded unchanged into the Daytona sandbox.
import {
  allowedUrl,
  publicAddress,
  robotsAllows,
} from "../workers/discovery/network.mjs";
test("SSRF policy rejects private IPv4, IPv6, credentials, ports and deceptive hosts", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.2",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "0.0.0.0",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of [
    "http://shop.example/products/1",
    "https://shop.example.attacker.test/x",
    "https://shop.example@127.0.0.1/x",
    "https://shop.example:444/x",
    "https://[::1]/",
  ])
    assert.throws(() => allowedUrl(url, ["shop.example"]));
  assert.equal(
    allowedUrl("https://shop.example/products/x?variant=123", ["shop.example"])
      .search,
    "?variant=123",
  );
});
test("robots exclusions and explicit longer allows are respected", () => {
  const robots =
    "User-agent: *\nDisallow: /search\nDisallow: /private\nAllow: /private/public\nDisallow: /*?*preview_theme_id=*";
  assert.equal(robotsAllows(robots, "/search?q=jacket"), false);
  assert.equal(robotsAllows(robots, "/private/public/a"), true);
  assert.equal(robotsAllows(robots, "/collections/all"), true);
  assert.equal(robotsAllows(robots, "/products/a?preview_theme_id=5"), false);
});
