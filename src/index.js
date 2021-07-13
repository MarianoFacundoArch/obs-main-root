const configProvider = require('./modules/config-provider/configProvider');
const dns2 = require('dns2');
const cors = require('cors');
const logger = require('./modules/logger/logger');
const { generateARecordsResponse } = require('./utils/generateARecordsResponse');
const { processTrackedServersTimeouts } = require('./modules/server-tracker/serverTracker');
const { trackServers } = require('./modules/server-tracker/serverTracker');
const { getDiscoveredServers } = require('./modules/server-discovery/serverDiscover');
const { discoverServers } = require('./modules/server-discovery/serverDiscover');
const { Packet } = dns2;
const express = require('express');
const app = express();
const requestIp = require('request-ip');
const debugRouter = require('./routers/debugRouter');
const corsOptions = {
	origin: '*',
	optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));
app.use(requestIp.mw());

app.use(debugRouter);
const server = dns2.createServer({
	udp: true,
	handle: (request, send, rinfo) => {
		try {
			const response = Packet.createResponseFromRequest(request);
			const [question] = request.questions;
			const { name } = question;

			generateARecordsResponse(!!rinfo ? rinfo.address : null, response.answers, name);
			send(response);
		} catch (err) {
			logger.error('Error on handle dns2: ' + err.toString());
		}
	}
});

// server.on('request', (request, response, rinfo) => {
// 	console.log(request.header.id, request.questions[0]);
// });

server.on('listening', () => {
	logger.debug('DNS Server Started');
});

require('./modules/geoip/geoIp')
	.initialize()
	.then(() => {
		try {
			discoverServers()
				.then(() => {
					trackServers();
				})
				.catch((err) => {
					logger.error('Could not do initial server discovery ' + err.toString());
				});

			setInterval(() => {
				discoverServers()
					.then(() => {})
					.catch((error) => {
						logger.error('Could not do server discovery: ' + error);
					});
			}, configProvider.INTERVAL_FOR_SERVER_DISCOVER_IN_SECONDS * 1000);

			// Server Tracker
			setInterval(() => {
				trackServers();
			}, configProvider.INTERVAL_FOR_SERVER_TRACKER_IN_SECONDS * 1000);

			setInterval(() => {
				processTrackedServersTimeouts();
			}, (configProvider.INTERVAL_FOR_SERVER_TRACKER_IN_SECONDS + 2) * 1000);

			server.listen({
				udp: configProvider.DNS_SERVER_PORT
			});

			app.listen(configProvider.HTTP_SERVER_PORT, () => {
				logger.debug('HTTP Server listening on port ' + configProvider.HTTP_SERVER_PORT);
			});
		} catch (err) {
			logger.error('Error on index.js: ' + err.toString());
		}
	})
	.catch((err) => {
		logger.error('Could not start server: ' + err.toString());
		process.exit(0);
	});
