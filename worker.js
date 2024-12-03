const fs = require('fs');
const path = require('path');
const randomUseragent = require('random-useragent');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();

puppeteer.use(StealthPlugin());

// 获取传入的用户编号
const userNumber = parseInt(process.argv[2] || process.env.USER_NUMBER);

// 其他函数保持不变
function getCurrentTime() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').split('.')[0];
}

function log(userIndex, message) {
    console.log(`[${getCurrentTime()}] [User ${userIndex + 1}] ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 从文件中读取代理信息并解析
function loadProxies(filePath) {
    const proxies = [];
    const data = fs.readFileSync(filePath, 'utf-8').split('\n');
    data.forEach(line => {
        const [ip, port] = line.trim().split(':');
        if (ip && port) {
            proxies.push({ ip, port });
        }
    });
    return proxies;
}

// 从文件中读取用户名和密码
function loadCredentials(filePath) {
    const credentials = [];
    const data = fs.readFileSync(filePath, 'utf-8').split('\n');
    data.forEach(line => {
        const [username, password] = line.trim().split(':');
        if (username && password) {
            credentials.push({ username, password });
        }
    });
    return credentials;
}

function getRandomFingerprint() {
    const languages = [
        // 英语变体
        'en-US', 'en-GB', 'en-CA', 'en-AU', 'en-NZ', 'en-IE', 'en-ZA', 'en-IN',
        // 欧洲语言
        'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH',
        'de-DE', 'de-AT', 'de-CH',
        'es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-CL',
        'it-IT', 'it-CH',
        'pt-PT', 'pt-BR',
        'nl-NL', 'nl-BE',
        'pl-PL', 'ru-RU', 'uk-UA',
        'sv-SE', 'no-NO', 'da-DK', 'fi-FI',
        // 亚洲语言
        'zh-CN', 'zh-TW', 'zh-HK',
        'ja-JP', 'ko-KR',
        'hi-IN', 'bn-IN', 'ta-IN',
        'th-TH', 'vi-VN', 'id-ID', 'ms-MY',
        // 其他地区
        'ar-SA', 'ar-AE', 'ar-EG',
        'tr-TR', 'he-IL', 'fa-IR'
    ];
    const colorProfiles = ['srgb', 'display-p3', 'color-gamut-p3'];
    const gpuVendors = ['intel', 'amd', 'nvidia'];

    // 生成随机缩放因子
    const randomScale = (Math.floor(Math.random() * 41) * 0.05 + 0.5).toFixed(2);
    
    // 生成随机分辨率
    const randomWidth = Math.floor(Math.random() * 40) * 40 + 800;  // 800-2360
    const randomHeight = Math.floor(Math.random() * 30) * 30 + 600; // 600-1470

    return [
        `--accept-lang=${languages[Math.floor(Math.random() * languages.length)]}`,
        `--force-color-profile=${colorProfiles[Math.floor(Math.random() * colorProfiles.length)]}`,
        `--force-device-scale-factor=${randomScale}`,
        `--window-size=${randomWidth},${randomHeight}`,
        `--gpu-vendor=${gpuVendors[Math.floor(Math.random() * gpuVendors.length)]}`,
    ];
}

async function launch(userIndex, userDataDir, proxy, userCredentials) {
    const extensionPath1 = path.resolve('extension');
    const extensionPath2 = path.resolve('canvas');

    const extensionPaths = [extensionPath1, extensionPath2].join(',');

    //const pemPath = path.resolve('1.0.14_0.pem');
    const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
    // 动态调试端口，根据 userIndex 生成不同的端口号
    const debuggingPort = 11500 + userIndex;

    log(userIndex, `Launching browser with user data directory: ${userDataDir}, proxy: ${proxyUrl}, and debugging port: ${debuggingPort}`);

    let executablePath;
    if (process.env.CHROME_PATH) {
        executablePath = process.env.CHROME_PATH;
    }
    console.log('Using Chrome path:', executablePath || 'Default Chromium from puppeteer');

    // 获取随机指纹参数
    const randomFingerprint = getRandomFingerprint();
    const browser = await puppeteer.launch({
        ...executablePath && { executablePath },
        headless: false,
        ignoreHTTPSErrors: true,
        userDataDir: userDataDir,
        args: [
            `--no-sandbox`,
            `--disable-extensions-except=${extensionPaths}`,
            `--load-extension=${extensionPaths}`,
            //`--ignore-certificate-errors=${pemPath}`,
            `--proxy-server=${proxyUrl}`,
            `--remote-debugging-port=${debuggingPort}`,  // 根据 userIndex 设置的调试端口
            //'--disable-gpu',  // 禁用GPU加速
            //'--disable-dev-shm-usage', // 禁用/dev/shm使用
            //'--disable-setuid-sandbox',
            '--no-first-run',
            '--no-zygote',
            `--js-flags=--max-old-space-size=512`, // 限制JavaScript堆内存

            // 随机指纹参数
            ...randomFingerprint,
            // 固定的反指纹参数
            //'--disable-gpu-driver-bug-workarounds',
            //'--disable-webgl2',
            //'--disable-reading-from-canvas',
            //'--disable-audio-output',
            
            // 随机化 WebGL 参数
            //Math.random() > 0.5 ? '--disable-webgl' : '--use-gl=desktop',
            Math.random() > 0.5 ? '--use-angle=d3d11' : '--use-angle=d3d9',
            
            // 随机化其他功能
            Math.random() > 0.5 ? '--disable-accelerated-2d-canvas' : '',
            Math.random() > 0.5 ? '--disable-canvas-aa' : '',
            Math.random() > 0.5 ? '--disable-2d-canvas-clip-aa' : '',
        ].filter(Boolean), // 过滤掉空字符串
    });
    log(userIndex, `Browser launched successfully with user data directory: ${userDataDir}`);

    // 遍历所有页面并关闭包含 "gradient" 的页面
    try {
        await sleep(5000)

        const pages = await browser.pages();
        for (const page of pages) {
            const url = await page.url(); // 获取页面的 URL
            if (url.includes("gradient")) {
                await page.close();
                log(userIndex, `Closed page with URL containing "gradient": ${url}`);
            }
        }
        
        log(userIndex, `Creating new page for user data directory: ${userDataDir}`);
        const page = await browser.newPage();
        log(userIndex, `Page created successfully for user data directory: ${userDataDir}`);

        const randomUserAgent = randomUseragent.getRandom();
        await page.setUserAgent(randomUserAgent);
        log(userIndex, `Using user agent: ${randomUserAgent}`);

        const url = 'https://app.gradient.network/';
        log(userIndex, `Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        log(userIndex, `Page loaded successfully for user data directory: ${userDataDir}`);

        // 查找并输入邮箱
        const emailSelector = 'input[placeholder="Enter Email"]';
        const passwordSelector = 'input[placeholder="Enter Password"]';
        
        // 输入邮箱
        const emailInput = await page.waitForSelector(emailSelector, { timeout: 5000 });
        if (emailInput) {
            await emailInput.type(userCredentials.username);
            log(userIndex, `Entered ${userCredentials.username} into email input.`);
            
            // 输入密码
            const passwordInput = await page.waitForSelector(passwordSelector, { timeout: 5000 });
            if (passwordInput) {
                await passwordInput.type(userCredentials.password);
                log(userIndex, `Entered ${userCredentials.password} into password input.`);

                // 按下回车键
                await passwordInput.press('Enter');
                log(userIndex, "Submitted login form.");
            } else {
                log(userIndex, "Password input not found, skipping.");
            }
        } else {
            log(userIndex, "Email input not found, skipping password input.");
        }
    } catch (e) {
        log(userIndex, `Error: ${e.message}`);
    }

    await sleep(10000)
    const pages = await browser.pages();
    // 遍历所有页面并关闭包含 "gradient" 的页面
    for (const page of pages) {
        const url = await page.url(); // 获取页面的 URL
        if (url.includes("gradient")) {
            await page.close();
            log(userIndex, `Closed page with URL containing "gradient": ${url}`);
        }
    }
}

// 主运行函数
async function run() {
    try {
        const userIndex = userNumber - 1;
        const baseUserDataDir = path.resolve('USERDATA');
        const userDataDir = path.join(baseUserDataDir, userNumber.toString().padStart(4, '0'));
        
        // 确保用户数据目录存在
        fs.mkdirSync(userDataDir, { recursive: true });

        // 读取代理和凭据
        const proxies = loadProxies('proxies.txt');
        const credentials = loadCredentials('credentials.txt');

        if (!proxies[userIndex] || !credentials[userIndex]) {
            throw new Error('代理或凭据不足');
        }

        await launch(userIndex, userDataDir, proxies[userIndex], credentials[userIndex]);
    } catch (error) {
        console.error(`Worker ${userNumber} error:`, error);
        process.exit(1);
    }
}

// 启动工作进程
run();

// 错误处理
process.on('uncaughtException', (err) => {
    console.error(`Worker ${userNumber} uncaught exception:`, err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`Worker ${userNumber} unhandled rejection:`, reason);
    process.exit(1);
});
