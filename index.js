import express from "express";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import path from "path";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import chalk from "chalk";
import dotenv from "dotenv";
import fs from "fs-extra";

import pairRouter from "./pair.js";
import qrRouter from "./qr.js";
import sessionRouter from "./getSession.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8000;

// Create sessions folder
const SESSION_FOLDER = process.env.SESSION_FOLDER || "./mega_sessions";
fs.ensureDirSync(SESSION_FOLDER);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/pair', limiter);
app.use('/qr', limiter);

// Logging
app.use(morgan('combined'));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// Increase event listeners
import("events").then((events) => {
    events.EventEmitter.defaultMaxListeners = 500;
});

// Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "guardian.html"));
});

app.use("/pair", pairRouter);
app.use("/qr", qrRouter);
app.use("/sessions", sessionRouter);

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        sessions: fs.readdirSync(SESSION_FOLDER).length,
        github: "pair_site"
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(chalk.red('Server error:'), err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(chalk.green(`
    ╔══════════════════════════════════════╗
    ║     🚀 Evo MD Server Started         ║
    ╠══════════════════════════════════════╣
    ║  📍 URL: http://localhost:${PORT}        ║
    ║  📁 Sessions: ./mega_sessions        ║
    ║  🐙 GitHub: pair_site                ║
    ║  🔄 Auto-sync: Every minute          ║
    ╚══════════════════════════════════════╝
    `));
});

// Start GitHub sync
import('./sync.js');

export default app;
