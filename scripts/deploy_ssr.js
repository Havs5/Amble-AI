const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    let entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

const publicDir = path.join(__dirname, '../public');
const publicNextDir = path.join(publicDir, '_next');

function safeRm(targetPath) {
    try {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }
    } catch (e) {
        console.warn(`Warning: failed to remove ${targetPath}:`, e.message || e);
    }
}

// Clean up public/_next before building to avoid Next.js conflict
if (fs.existsSync(publicNextDir)) {
    console.log('Cleaning up previous public/_next...');
    fs.rmSync(publicNextDir, { recursive: true, force: true });
}

console.log('Building Next.js app...');
const nextDir = path.join(__dirname, '../.next');

const shouldSkipBuild = process.env.SKIP_NEXT_BUILD === '1' && fs.existsSync(path.join(nextDir, 'BUILD_ID'));
if (shouldSkipBuild) {
    console.log('Skipping Next.js build (SKIP_NEXT_BUILD=1 and existing .next/BUILD_ID found).');
} else {
    // On Windows/OneDrive, Next can sometimes leave behind diagnostics files that trigger readlink errors.
    safeRm(path.join(nextDir, 'diagnostics'));

    try {
        execSync('npm run build', { stdio: 'inherit' });
    } catch (e) {
        console.warn('Next build failed once. Cleaning .next and retrying...');
        safeRm(nextDir);
        safeRm(path.join(publicDir, '_next'));
        execSync('npm run build', { stdio: 'inherit' });
    }
}

console.log('Preparing functions directory...');
const functionsDir = path.join(__dirname, '../functions');

// Copy .next to functions/.next
console.log('Copying .next to functions/.next...');
if (fs.existsSync(path.join(functionsDir, '.next'))) {
    fs.rmSync(path.join(functionsDir, '.next'), { recursive: true, force: true });
}
copyDir(nextDir, path.join(functionsDir, '.next'));

// Copy public to functions/public
console.log('Copying public to functions/public...');
if (fs.existsSync(path.join(functionsDir, 'public'))) {
    fs.rmSync(path.join(functionsDir, 'public'), { recursive: true, force: true });
}
copyDir(publicDir, path.join(functionsDir, 'public'));

// Copy next.config.js
console.log('Copying next.config.js...');
fs.copyFileSync(path.join(__dirname, '../next.config.js'), path.join(functionsDir, 'next.config.js'));

// Copy .env and .env.local to functions/.env (filtering out conflicting secrets)
console.log('Copying .env/.env.local to functions/.env (with filter)...');
const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');
const envDestPath = path.join(functionsDir, '.env');
const CONFLICTING_SECRETS = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'TAVILY_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX']; 

let combinedEnv = '';

if (fs.existsSync(envPath)) {
    combinedEnv += fs.readFileSync(envPath, 'utf8') + '\n';
}

if (fs.existsSync(envLocalPath)) {
    combinedEnv += fs.readFileSync(envLocalPath, 'utf8') + '\n';
}

if (combinedEnv) {
    const filteredContent = combinedEnv.split('\n').filter(line => {
        const key = line.split('=')[0].trim();
        // Keep lines that are comments, empty, or NOT in the conflicting list
        return !key || line.trim().startsWith('#') || !CONFLICTING_SECRETS.includes(key);
    }).join('\n');
    
    fs.writeFileSync(envDestPath, filteredContent);
    console.log('Environment variables copied successfully.');
} else {
    console.warn('Warning: No .env or .env.local found. Environment variables might be missing in Functions.');
}

// Prepare public/_next/static for Hosting
console.log('Preparing public/_next/static for Hosting...');
const publicNextStaticDir = path.join(publicDir, '_next/static');
if (fs.existsSync(publicNextStaticDir)) {
    fs.rmSync(publicNextStaticDir, { recursive: true, force: true });
}
copyDir(path.join(nextDir, 'static'), publicNextStaticDir);

console.log('Ready to deploy!');
console.log('Run: firebase deploy --only "functions,hosting"');
