import express from "express";
import fs from "fs-extra";
import pino from "pino";
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pn from "awesome-phonenumber";
import { upload } from "./mega.js";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Logger setup
const logger = pino({ level: "fatal" });

function removeFile(FilePath) {
    try {
        if (fs.existsSync(FilePath)) {
            fs.removeSync(FilePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error(chalk.red("Error removing file:"), e);
        return false;
    }
}

function getMegaFileId(url) {
    try {
        const match = url.match(/\/file\/([^#]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// Ensure mega_sessions folder exists
const SESSION_FOLDER = process.env.SESSION_FOLDER || "./mega_sessions";
fs.ensureDirSync(SESSION_FOLDER);

router.get("/", async (req, res) => {
    let num = req.query.number;
    
    if (!num) {
        return res.status(400).send({
            code: "Phone number is required"
        });
    }

    // Clean number
    num = num.replace(/[^0-9]/g, "");
    const phone = pn("+" + num);

    if (!phone.isValid()) {
        return res.status(400).send({
            code: "Invalid phone number. Use full international format"
        });
    }

    num = phone.getNumber("e164").replace("+", "");
    const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 15);
    const sessionPath = path.join(SESSION_FOLDER, `session_${num}_${sessionId}`);

    // Ensure session directory is clean
    await removeFile(sessionPath);
    fs.ensureDirSync(sessionPath);

    console.log(chalk.blue(`\n🔐 New pair request for: ${num}`));

    async function initiateSession() {
        let EvoBot = null;
        
        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            EvoBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                printQRInTerminal: false,
                logger: logger,
                browser: Browsers.windows("Chrome"),
                markOnlineOnConnect: true,
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
            });

            let pairingCodeSent = false;

            // Handle connection updates
            EvoBot.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log(chalk.green(`✅ Connected successfully for ${num}`));
                    
                    try {
                        // Wait a bit for session to stabilize
                        await delay(3000);
                        
                        const credsPath = path.join(sessionPath, "creds.json");
                        
                        if (fs.existsSync(credsPath)) {
                            // Read creds file
                            const credsData = fs.readJsonSync(credsPath);
                            
                            // Upload to MEGA
                            console.log(chalk.blue(`📤 Uploading session to MEGA...`));
                            const megaUrl = await upload(
                                credsPath,
                                `creds_${num}_${Date.now()}.json`
                            );

                            const megaFileId = getMegaFileId(megaUrl);
                            
                            if (megaFileId) {
                                const sessionId = `Evo-MD®-${megaFileId}`;
                                const userJid = jidNormalizedUser(`${num}@s.whatsapp.net`);

                                // Save session info
                                const sessionInfo = {
                                    phoneNumber: num,
                                    sessionId: sessionId,
                                    megaFileId: megaFileId,
                                    timestamp: new Date().toISOString(),
                                    type: "pair_code",
                                    github: "pair_site"
                                };
                                
                                const infoPath = path.join(SESSION_FOLDER, `session_info_${num}_${Date.now()}.json`);
                                await fs.writeJson(infoPath, sessionInfo, { spaces: 2 });
                                
                                console.log(chalk.green(`📁 Session info saved`));

                                // Send creds.json as document with caption
                                await EvoBot.sendMessage(userJid, {
                                    document: {
                                        url: credsPath
                                    },
                                    mimetype: "application/json",
                                    fileName: "creds.json",
                                    caption: `╔══════════════════════════╗
║    ✅ *EVO MD GUARDIAN*    ║
╚══════════════════════════╝

🔐 *SESSION ID*
\`\`\`${sessionId}\`\`\`

📁 *CREDS.JSON ATTACHED*
⚡ Keep this file safe

📊 *STATUS*
├─ 🤖 Bot: Evo MD
├─ 📱 Number: +${num}
├─ 🔒 Type: Pair Code
└─ 🐙 Repo: pair_site

⚠️ *WARNING*
Don't share this file with anyone!
It contains your WhatsApp session.`,
                                });

                                console.log(chalk.green(`✅ Session ID sent to ${num}`));
                            }
                        }

                        // Cleanup
                        await delay(2000);
                        await removeFile(sessionPath);
                        await delay(1000);
                        process.exit(0);
                        
                    } catch (err) {
                        console.error(chalk.red("Error in connection open:"), err);
                        await removeFile(sessionPath);
                        process.exit(1);
                    }
                }

                if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode !== 401) {
                        console.log(chalk.yellow(`🔄 Reconnecting for ${num}...`));
                        initiateSession();
                    }
                }
            });

            // Handle credentials update
            EvoBot.ev.on("creds.update", saveCreds);

            // Request pairing code
            if (!EvoBot.authState.creds.registered) {
                await delay(2000);
                let code = await EvoBot.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join("-") || code;

                if (!res.headersSent) {
                    console.log(chalk.green(`📲 Pairing code sent for ${num}`));
                    res.send({ code });
                    pairingCodeSent = true;
                }
            }

            // Timeout handler
            setTimeout(async () => {
                if (!pairingCodeSent && !res.headersSent) {
                    res.status(408).send({ code: "Request timeout" });
                    await removeFile(sessionPath);
                    process.exit(1);
                }
            }, 60000);

        } catch (err) {
            console.error(chalk.red("Session error:"), err);
            if (!res.headersSent) {
                res.status(503).send({ code: "Service unavailable" });
            }
            await removeFile(sessionPath);
            process.exit(1);
        }
    }

    await initiateSession();
});

export default router;
