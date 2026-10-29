module.exports = {
	apps: [
		{
			name: 'messenger-server',
			cwd: __dirname,
			script: 'dist/main.js',
			exec_mode: 'fork',
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '512M',
			kill_timeout: 10000,
			time: true,
			merge_logs: true,
			env: {
				NODE_ENV: 'production'
			}
		}
	]
}
