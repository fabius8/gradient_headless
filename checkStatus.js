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
                    console.log(url)
                    const textResponse = await response.text();  // 使用 text() 获取原始文本

                    console.log('Response Text:', textResponse); // 打印原始响应
                    const responseData = JSON.parse(textResponse);  // 解析 JSON
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

                    responseHandled = true; // 设置标志为真，表示响应已处理
                } catch (error) {
                    if (!(error instanceof Error) || !error.message.includes('Could not load body for this request')) {
                        console.error('Error parsing response:', error);
                    }
                }
            }
        });

        await page.goto('chrome-extension://caacbgbklghmpodbdafajbgdnegacfmo/popup.html', {
            waitUntil: 'networkidle0',
            timeout: 8000
        });

        // 等待响应或超时
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!responseHandled) {
                    reject(new Error('Response timeout'));
                }
            }, 5000);

            const checkResponse = setInterval(() => {
                if (responseHandled) {
                    clearTimeout(timeout);
                    clearInterval(checkResponse);
                    resolve();
                }
            }, 100); // 定期检查响应是否已处理
        });

        return true;
    } catch (error) {
        console.error('\nError during monitoring:', error);
        return false;
    } finally {
        if (loadingAnimation) {
            clearInterval(loadingAnimation);
        }
        if (page) {
            await page.close();
        }
        if (browser) {
            await browser.disconnect();
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
