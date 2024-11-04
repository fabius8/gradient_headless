module.exports = {
    apps: [{
        name: "gradient-manager",
        script: "./main.js",
        watch: false,
        max_memory_restart: "1G",
        env: {
            NODE_ENV: "production",
        }
    }]
};