const path = require('path');
const fs = require('fs');

const maxmind = require('maxmind');
const logger = require('../logger/logger');
const configProvider = require('../config-provider/configProvider');

let lookup = null;

const getGeoIpDbRoute = () => {
	let current = path.join(__dirname, '../../../geoip-db/GeoIP2-City.mmdb');

	if (
		configProvider.CUSTOM_GEOIP_DB_ROUTE &&
		configProvider.CUSTOM_GEOIP_DB_ROUTE.length > 0 &&
		fs.existsSync(configProvider.CUSTOM_GEOIP_DB_ROUTE)
	) {
		current = configProvider.CUSTOM_GEOIP_DB_ROUTE;
		logger.info('Using ' + current + ' as geoip database');
	}

	return current;
};

const initialize = () => {
	return new Promise((resolve, reject) => {
		if (!lookup) {
			try {
				let current = path.join(getGeoIpDbRoute());

				maxmind
					.open(current, {
						watchForUpdates: true
					})
					.then((resultingLookup) => {
						lookup = resultingLookup;
						logger.debug('GeoIp resolver started');
						resolve();
					})
					.catch((err) => {
						logger.error('Error starting GeoIp service: ' + err);
						reject(err);
					});
			} catch (err) {
				logger.error('Error on GeoIp initialization: ' + err);
				reject(err);
			}
		}
	});
};

const getCoordinatesForIp = (ip) => {
	try {
		const location = lookup.get(ip).location;
		return [location.latitude, location.longitude];
	} catch (err) {
		logger.error('Error trying to resolve GeoIp (' + ip + ') : ' + err);
		return [0, 0];
	}
};

const getFullLocationInformation = (ip) => {
	try {
		const location = lookup.get(ip);
		return location;
	} catch (err) {
		logger.error('Error trying to resolve GeoIp (' + ip + ') : ' + err);
		return { err: 'Could not resolve' };
	}
};

module.exports = { getCoordinatesForIp, getFullLocationInformation, initialize };
