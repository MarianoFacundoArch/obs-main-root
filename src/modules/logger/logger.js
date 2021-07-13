const log4js = require('log4js');
const path = require('path');
const chalk = require('chalk');
log4js.configure({
	appenders: {
		consoleAppender: { type: 'console' },
		fileLogger: {
			type: 'file',
			filename: path.join(__dirname, '../../../error.log')
		}
	},
	categories: {
		// default: { appenders: ['webrtcMainRootAppender'], level: 'error' }
		default: { appenders: ['consoleAppender'], level: 'debug' }
	}
});
console.log(
	chalk.yellow('Error log can be found on: ' + path.join(__dirname, '../../../error.log'))
);
const logger = log4js.getLogger('fileLogger');

module.exports = logger;
