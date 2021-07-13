const dotenvExtended = require('dotenv-extended');
// const dotenvMustache = require('dotenv-mustache');
const dotenvParseVariables = require('dotenv-parse-variables');

let env = dotenvExtended.load({
	silent: true,
	errorOnMissing: false,
	errorOnExtra: true,
	includeProcessEnv: true,
	assignToProcessEnv: true,
	overrideProcessEnv: false,
	errorOnRegex: true
});

// env = dotenvMustache(env);
env = dotenvParseVariables(env);

module.exports = env;
