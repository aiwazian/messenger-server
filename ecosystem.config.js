export const apps = [
    {
        name: "messenger-server",
        script: "./dist/Server.js",

        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        },
        env_file: '.env',
    },
]