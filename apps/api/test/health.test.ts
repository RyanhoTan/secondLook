import { expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
it("provides a health endpoint",async()=>{const res=await request(createApp()).get("/api/v1/health");expect(res.status).toBe(200);expect(res.body.status).toBe("ok");});
