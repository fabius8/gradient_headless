const pm2 = require('pm2');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startProcesses(uniqueUserNumbers) {
    return new Promise((resolve, reject) => {
        pm2.connect(async function(err) {
            if (err) {
                console.error(err);
                reject(err);
                return;
            }

            for (const userNumber of uniqueUserNumbers) {
                await new Promise((resolveStart) => {
                    pm2.start({
                        script: 'worker.js',
                        name: `gradient-worker-${userNumber}`,
                        args: [userNumber.toString()],
                        max_memory_restart: '500M',
                        env: {
                            USER_NUMBER: userNumber
                        }
                    }, (err, apps) => {
                        if (err) {
                            console.error(`启动进程 ${userNumber} 失败:`, err);
                        } else {
                            console.log(`进程 ${userNumber} 启动成功`);
                        }
                        resolveStart();
                    });
                });

                await sleep(10000); // 等待10秒
            }

            // 监控所有进程
            pm2.launchBus((err, bus) => {
                bus.on('process:event', function(data) {
                    console.log('[PM2] Process Event:', data);
                });
            });

            resolve();
        });
    });
}

rl.question('请输入要运行的用户编号（例如：2 或者范围 1-5）：', async (input) => {
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
        rl.close();
        return;
    }

    try {
        await startProcesses(uniqueUserNumbers);
        console.log("所有进程已启动完成");
    } catch (error) {
        console.error("启动进程时发生错误:", error);
    } finally {
        rl.close();
    }
});

// 优雅退出
process.on('SIGINT', function() {
    pm2.disconnect();
    process.exit();
});
