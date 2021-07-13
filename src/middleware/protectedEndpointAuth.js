const configProvider = require('../modules/config-provider/configProvider');
const protectedEndpointAuth = (req, res, next) => {
	try {
		if (req && req.query && req.query.token === configProvider.OBS_MAIN_ROOT_AUTH_TOKEN) next();
		else throw new Error('Invalid auth');
	} catch (err) {
		res.status(401).send({ err: true, desc: err.toString() });
	}
};

module.exports = protectedEndpointAuth;
