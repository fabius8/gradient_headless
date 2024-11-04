const pm2 = require('pm2');

// 从命令行获取参数
const START_USER = parseInt(process.argv[2] || 1);
const END_USER = parseInt(process.argv[3] || 100);

console.log(`准备启动用户 ${START_USER} 到 ${END_USER}`);

pm2.connect(function(err) {
    if (err) {
        console.error(err);
        process.exit(2);
    }

    for(let userNumber = START_USER; userNumber <= END_USER; userNumber++) {
        pm2.start({
            script: './worker.js',
            name: `gradient-user-${userNumber}`,
            args: [userNumber.toString()],
            max_memory_restart: '500M',
            env: {
                USER_NUMBER: userNumber
            }
        }, (err, apps) => {
            if (err) {
                console.error(`User ${userNumber} 启动失败:`, err);
            } else {
                console.log(`User ${userNumber} 启动成功`);
            }
        });
    }
});
