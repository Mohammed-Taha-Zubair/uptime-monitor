import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { checkUrl } from "./checkUrl";

describe("checkUrl", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Spin up a simple local HTTP server with specific test endpoints
    server = http.createServer((req, res) => {
      if (req.url === "/200") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else if (req.url === "/500") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      } else if (req.url === "/redirect") {
        res.writeHead(302, { Location: "/200" });
        res.end();
      } else if (req.url === "/slow") {
        // Delay response to trigger the timeout
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Slow OK");
        }, 300);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      // Port 0 tells the OS to assign an available ephemeral port
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("returns isUp=true for 200 OK", async () => {
    const result = await checkUrl(`${baseUrl}/200`);
    expect(result.isUp).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
  });

  it("returns isUp=false for 500 Internal Server Error", async () => {
    const result = await checkUrl(`${baseUrl}/500`);
    expect(result.isUp).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toContain("500");
  });

  it("follows redirects and returns isUp=true for 302 -> 200", async () => {
    const result = await checkUrl(`${baseUrl}/redirect`);
    expect(result.isUp).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
  });

  it("returns isUp=false with timeout error when server is too slow", async () => {
    // Set a very short timeout for this test
    const originalTimeout = process.env.CHECK_TIMEOUT_MS;
    process.env.CHECK_TIMEOUT_MS = "50";

    try {
      const result = await checkUrl(`${baseUrl}/slow`);
      expect(result.isUp).toBe(false);
      expect(result.statusCode).toBeNull();
      expect(result.responseMs).toBeNull();
      expect(result.error).toContain("timed out after 50ms");
    } finally {
      // Restore previous environment variable
      if (originalTimeout !== undefined) {
        process.env.CHECK_TIMEOUT_MS = originalTimeout;
      } else {
        delete process.env.CHECK_TIMEOUT_MS;
      }
    }
  });

  it("returns isUp=false when connection is refused", async () => {
    // Start and immediately close a server to get a guaranteed unused port
    const tempServer = http.createServer();
    await new Promise<void>((resolve) => tempServer.listen(0, "127.0.0.1", () => resolve()));
    const addr = tempServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 59123;
    await new Promise<void>((resolve) => tempServer.close(() => resolve()));

    const result = await checkUrl(`http://127.0.0.1:${port}/unused`);
    expect(result.isUp).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.responseMs).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error).not.toBeNull();
  });
});
