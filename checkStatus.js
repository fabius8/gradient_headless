const puppeteer = require('puppeteer');
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function startLoadingAnimation() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    return setInterval(() => {
        process.stdout.write(`\r${frames[i]} Monitoring requests...`);
        i = (i + 1) % frames.length;
    }, 80);
}

async function connectBrowser(port) {
    try {
        let wsKey = await axios.get(`http://127.0.0.1:${port}/json/version`);
        console.log(wsKey.data.webSocketDebuggerUrl);

        let browser = await puppeteer.connect({
            browserWSEndpoint: wsKey.data.webSocketDebuggerUrl,
            defaultViewport: null
        });
        console.log(`Successfully connected to browser on port ${port}`);
        return browser;
    } catch (error) {
        console.error(`Failed to connect to browser on port ${port}:`, error.message);
        return null;
    }
}

async function monitorExtension(port) {
    let browser = await connectBrowser(port);
    let loadingAnimation = null;
    let page = null;
    
    if (!browser) {
        return false;
    }

    try {
        page = await browser.newPage();
        loadingAnimation = startLoadingAnimation();

        let responseHandled = false;

        page.on('response', async response => {
            const url = response.url();
            if (url.includes('api.gradient.network/api/sentrynode/get/')) {
                try {
                    const responseData = await response.json();
                    if (!responseData || !responseData.data) return;

                    if (loadingAnimation) {
                        clearInterval(loadingAnimation);
                        process.stdout.write('\r');
                    }
                    
                    const { active, ip } = responseData.data;
                    console.log('\n状态检查结果:');
                    console.log(`IP地址: ${ip}`);
                    console.log(`活动状态: ${active ? '正常' : '失败'}`);
                    
                    if (!active) {
                        console.log('\n警告: 节点状态为非活动状态!');
                    }

                    responseHandled = true;
                    // 获取到信息后立即退出
                    process.exit(0);
                } catch (error) {
                    if (!(error instanceof Error) || !error.message.includes('Could not load body for this request')) {
                        console.error('Error parsing response:', error);
                    }
                }
            }
        });

        // 减少等待时间到30秒
        await page.goto('chrome-extension://caacbgbklghmpodbdafajbgdnegacfmo/popup.html', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // 如果30秒内没有获取到响应，则超时
        await new Promise((_, reject) => setTimeout(() => reject(new Error('Response timeout')), 30000));

        return true;
    } catch (error) {
        if (error.message !== 'Response timeout') {
            console.error('\nError during monitoring:', error);
        } else {
            console.log('\n未能在指定时间内获取节点状态。');
        }
        return false;
    } finally {
        if (loadingAnimation) {
            clearInterval(loadingAnimation);
        }
        if (page) {
            await page.close().catch(() => {});
        }
        if (browser) {
            await browser.disconnect().catch(() => {});
        }
    }
}


async function startMonitoring() {
    let port;

    while (true) {
        port = parseInt(await askQuestion("Enter port number (e.g., 11501): "));
        if (!isNaN(port) && port > 0) break;
        console.log("Invalid input. Please enter a valid port number.");
    }

    console.log(`Trying port ${port}...`);
    const success = await monitorExtension(port);
    
    if (!success) {
        console.log(`Failed to connect on port ${port}.`);
    }

    rl.close();
    process.exit(0);

}

startMonitoring().catch(console.error);

process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, exiting...');
    rl.close();
    process.exit(0);
});
