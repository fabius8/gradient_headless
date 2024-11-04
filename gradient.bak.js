const fs = require('fs');
const path = require('path');
const randomUseragent = require('random-useragent');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');

puppeteer.use(StealthPlugin());

// 格式化当前时间的函数
function getCurrentTime() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').split('.')[0]; // 形如 "YYYY-MM-DD HH:MM:SS"
}

// 日志打印函数，包含时间戳和用户编号
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

async function launch(userIndex, userDataDir, proxy, userCredentials) {
    const extensionPath = path.resolve('extension');
    const pemPath = path.resolve('1.0.13_0.pem');
    const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
    // 动态调试端口，根据 userIndex 生成不同的端口号
    const debuggingPort = 11500 + userIndex;

    log(userIndex, `Launching browser with user data directory: ${userDataDir}, proxy: ${proxyUrl}, and debugging port: ${debuggingPort}`);
    const browser = await puppeteer.launch({
        //executablePath: '/usr/bin/google-chrome-stable',
        headless: false,
        ignoreHTTPSErrors: true,
        userDataDir: userDataDir,
        args: [
            `--no-sandbox`,
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            `--ignore-certificate-errors=${pemPath}`,
            `--proxy-server=${proxyUrl}`,
            `--remote-debugging-port=${debuggingPort}`,  // 根据 userIndex 设置的调试端口
            '--disable-gpu',  // 禁用GPU加速
            '--disable-dev-shm-usage', // 禁用/dev/shm使用
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-zygote',
            `--js-flags=--max-old-space-size=512`, // 限制JavaScript堆内存
        ],
    });
    log(userIndex, `Browser launched successfully with user data directory: ${userDataDir}`);

    try {
        await sleep(5000)

        const pages = await browser.pages();
        // 遍历所有页面并关闭包含 "gradient" 的页面
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
}

async function run(userNumbers, proxies, credentials) {
    const baseUserDataDir = path.resolve('USERDATA');

    // 检查代理和凭据数量是否足够
    if (userNumbers.length > proxies.length || userNumbers.length > credentials.length) {
        console.log("代理或凭据数量不足，请添加更多代理或用户信息！");
        return;
    }

    for (const userNumber of userNumbers) {
        const userIndex = userNumber - 1;
        if (userIndex >= proxies.length || userIndex >= credentials.length) {
            log(userIndex, `用户 ${userNumber} 超出可用代理或凭据的范围，请添加更多。`);
            return;
        }

        const userDataDir = path.join(baseUserDataDir, userNumber.toString().padStart(4, '0'));
        fs.mkdirSync(userDataDir, { recursive: true });
        
        // 使用对应的代理
        const proxy = proxies[userIndex];
        log(userIndex, `Using proxy: ${proxy.ip}:${proxy.port}`);
        
        // 读取对应的用户名和密码
        const userCredentials = credentials[userIndex];
        log(userIndex, `Credentials: ${userCredentials.username}:${userCredentials.password}`);
        
        // 启动浏览器
        await launch(userIndex, userDataDir, proxy, userCredentials);
    }
}

// 读取用户输入
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('请输入要运行的用户编号（例如：2 或者范围 1-5）：', (input) => {
    const userNumbers = [];
    const parts = input.split(' ');

    parts.forEach(part => {
        if (part.includes('-')) {
            const range = part.split('-').map(Number);
            if (range.length === 2 && range[0] <= range[1]) {
                for (let i = range[0]; i <= range[1]; i++) {
                    userNumbers.push(i);
                }
            }
        } else {
            userNumbers.push(Number(part));
        }
    });

    // 去重并排序
    const uniqueUserNumbers = [...new Set(userNumbers)].sort((a, b) => a - b);

    if (uniqueUserNumbers.length === 0) {
        console.log("没有有效的用户编号，请重新运行脚本并输入有效的编号。");
    } else {
        // 读取代理文件并解析
        const proxies = loadProxies('proxies.txt');
        if (proxies.length === 0) {
            console.log("没有可用的代理，请检查 proxies.txt 文件是否有内容。");
        } else {
            // 读取用户名和密码
            const credentials = loadCredentials('credentials.txt');
            if (credentials.length === 0) {
                console.log("没有可用的凭据，请检查 credentials.txt 文件是否有内容。");
            } else {
                run(uniqueUserNumbers, proxies, credentials);
            }
        }
    }

    rl.close();
});
