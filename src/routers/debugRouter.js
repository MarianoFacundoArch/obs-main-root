const express = require('express');
const protectedEndpointAuth = require('../middleware/protectedEndpointAuth');
const { getFullLocationInformation } = require('../modules/geoip/geoIp');
const { selectOptimalServerBasedOnLocation } = require('../modules/server-selector/serverSelector');

const router = express.Router();

router.get('/debug/server_selection/:hostname', protectedEndpointAuth, (req, res) => {
	try {
		const optimalServerBasedOnLocation = selectOptimalServerBasedOnLocation(
			req.clientIp,
			req.params.hostname,
			[],
			false
		);
		res.send({
			ip: req.clientIp,
			debugData: optimalServerBasedOnLocation,
			location: getFullLocationInformation(req.clientIp)
		});
	} catch (e) {
		console.log(e);
		res.status(500).send('ERROR');
	}
});

router.get('/debug/server_selection/:hostname/:ip', protectedEndpointAuth, (req, res) => {
	try {
		const optimalServerBasedOnLocation = selectOptimalServerBasedOnLocation(
			req.params.ip,
			req.params.hostname,
			[],
			false
		);
		res.send({
			ip: req.params.ip,
			debugData: optimalServerBasedOnLocation,
			location: getFullLocationInformation(req.clientIp)
		});
	} catch (e) {
		console.log(e);
		res.status(500).send('ERROR');
	}
});
router.get('/debug/server_selection/extended/:hostname', protectedEndpointAuth, (req, res) => {
	try {
		const optimalServerBasedOnLocation = selectOptimalServerBasedOnLocation(
			req.clientIp,
			req.params.hostname,
			[],
			true
		);
		res.send({
			ip: req.clientIp,
			debugData: optimalServerBasedOnLocation,
			location: getFullLocationInformation(req.clientIp)
		});
	} catch (e) {
		console.log(e);
		res.status(500).send('ERROR');
	}
});

router.get('/debug/server_selection/extended/:hostname/:ip', protectedEndpointAuth, (req, res) => {
	try {
		const optimalServerBasedOnLocation = selectOptimalServerBasedOnLocation(
			req.params.ip,
			req.params.hostname,
			[],
			true
		);
		res.send({
			ip: req.params.ip,
			debugData: optimalServerBasedOnLocation,
			location: getFullLocationInformation(req.clientIp)
		});
	} catch (e) {
		console.log(e);
		res.status(500).send('ERROR');
	}
});

module.exports = router;
