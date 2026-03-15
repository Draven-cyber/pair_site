import express from "express";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const SESSION_FOLDER = process.env.SESSION_FOLDER || "./mega_sessions";

// Ensure folder exists
fs.ensureDirSync(SESSION_FOLDER);

// List all sessions
router.get("/list", async (req, res) => {
    try {
        const files = await fs.readdir(SESSION_FOLDER);
        const sessionFiles = files.filter(f => f.startsWith("session_info_") && f.endsWith(".json"));
        
        const sessions = await Promise.all(
            sessionFiles.map(async (file) => {
                const content = await fs.readJson(path.join(SESSION_FOLDER, file));
                return {
                    ...content,
                    filename: file
                };
            })
        );
        
        // Sort by timestamp (newest first)
        sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json({
            count: sessions.length,
            sessions: sessions
        });
    } catch (error) {
        console.error(chalk.red("Error listing sessions:"), error);
        res.status(500).json({ error: "Failed to list sessions" });
    }
});

// Get session by phone
router.get("/phone/:phone", async (req, res) => {
    const phone = req.params.phone;
    
    try {
        const files = await fs.readdir(SESSION_FOLDER);
        const sessionFile = files.find(f => f.includes(`_info_${phone}_`) && f.endsWith(".json"));
        
        if (!sessionFile) {
            return res.status(404).json({ error: "Session not found" });
        }
        
        const sessionInfo = await fs.readJson(path.join(SESSION_FOLDER, sessionFile));
        res.json(sessionInfo);
        
    } catch (error) {
        console.error(chalk.red("Error retrieving session:"), error);
        res.status(500).json({ error: "Failed to retrieve session" });
    }
});

// Get session by ID
router.get("/id/:sessionId", async (req, res) => {
    const sessionId = req.params.sessionId;
    
    try {
        const files = await fs.readdir(SESSION_FOLDER);
        
        for (const file of files) {
            if (file.endsWith(".json")) {
                const content = await fs.readJson(path.join(SESSION_FOLDER, file));
                if (content.sessionId === sessionId) {
                    return res.json(content);
                }
            }
        }
        
        res.status(404).json({ error: "Session not found" });
        
    } catch (error) {
        console.error(chalk.red("Error retrieving session:"), error);
        res.status(500).json({ error: "Failed to retrieve session" });
    }
});

// Delete old sessions (cleanup)
router.post("/cleanup", async (req, res) => {
    try {
        const files = await fs.readdir(SESSION_FOLDER);
        const sessionFiles = files.filter(f => f.startsWith("session_info_") && f.endsWith(".json"));
        
        let deleted = 0;
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000; // 1 week
        
        for (const file of sessionFiles) {
            const filePath = path.join(SESSION_FOLDER, file);
            const stats = await fs.stat(filePath);
            
            if (now - stats.mtimeMs > oneWeek) {
                await fs.remove(filePath);
                deleted++;
            }
        }
        
        res.json({
            message: `Cleaned up ${deleted} old sessions`,
            remaining: sessionFiles.length - deleted
        });
        
    } catch (error) {
        console.error(chalk.red("Error cleaning sessions:"), error);
        res.status(500).json({ error: "Failed to clean sessions" });
    }
});

export default router;
