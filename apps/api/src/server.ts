import "dotenv/config";
import { createApp } from "./app.js";
createApp().listen(3000,"0.0.0.0",()=>console.log("API http://localhost:3000/api/v1"));
