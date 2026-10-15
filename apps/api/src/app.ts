import express from "express";
export function createApp() { const app = express(); app.get("/api/v1/health", (_req,res) => res.json({status:"ok"})); return app; }
