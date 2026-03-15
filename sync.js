import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GitSync {
    constructor() {
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.syncCount = 0;
        this.token = process.env.GITHUB_TOKEN;
        this.repo = process.env.GITHUB_REPO;
        this.owner = process.env.GITHUB_OWNER;
        this.repoUrl = `https://${this.token}@github.com/${this.owner}/${this.repo}.git`;
    }

    async initialize() {
        console.log(chalk.blue('🔄 Initializing GitHub Auto-Sync System (Every Minute)...'));
        
        // Initialize git if not exists
        if (!fs.existsSync(path.join(__dirname, '.git'))) {
            console.log(chalk.yellow('📦 Cloning repository with token...'));
            const git = simpleGit(__dirname);
            await git.clone(this.repoUrl, __dirname);
            console.log(chalk.green('✅ Repository cloned successfully'));
        }

        // Set remote URL with token
        const git = simpleGit(__dirname);
        await git.addRemote('origin', this.repoUrl);
        
        // Start cron job for every minute
        cron.schedule('* * * * *', () => this.sync());
        console.log(chalk.green('✅ Auto-sync scheduled: Every minute'));
        
        // Initial sync
        await this.sync();
    }

    async sync() {
        if (this.isSyncing) {
            console.log(chalk.yellow('⏳ Sync already in progress...'));
            return;
        }

        this.isSyncing = true;
        
        try {
            console.log(chalk.blue(`\n🔄 Syncing with GitHub (${new Date().toLocaleTimeString()})...`));
            
            const git = simpleGit(__dirname);
            
            // Fetch latest changes
            await git.fetch();
            
            // Check status
            const status = await git.status();
            
            if (status.behind > 0) {
                console.log(chalk.yellow(`📥 Found ${status.behind} new updates`));
                
                // Pull changes
                await git.pull('origin', 'main');
                
                console.log(chalk.green('✅ Repository updated successfully'));
                
                // Install any new dependencies
                console.log(chalk.blue('📦 Checking for new dependencies...'));
                await execPromise('npm install');
                
                // Restart the application
                console.log(chalk.yellow('🔄 Restarting application...'));
                setTimeout(() => {
                    process.exit(0);
                }, 2000);
            } else {
                console.log(chalk.green('✓ Repository is up to date'));
            }
            
            this.lastSyncTime = new Date();
            this.syncCount++;
            console.log(chalk.gray(`Last sync: ${this.lastSyncTime.toLocaleTimeString()} | Total syncs: ${this.syncCount}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Sync error:'), error.message);
        } finally {
            this.isSyncing = false;
        }
    }
}

// Start sync system
const sync = new GitSync();
sync.initialize();

export default sync;
