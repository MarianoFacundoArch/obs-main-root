const dns2 = require('dns2');
const { Packet } = dns2;

const server = dns2.createServer({
    udp: true,
    handle: (request, send, rinfo) => {
        console.log(request)
        console.log(rinfo)
        const response = Packet.createResponseFromRequest(request);
        const [ question ] = request.questions;
        const { name } = question;
        console.log(name)
        response.answers.push({
            name,
            type: Packet.TYPE.A,
            class: Packet.CLASS.IN,
            ttl: 1,
            address: '8.8.8.8'
        });

        response.answers.push({
            name,
            type: Packet.TYPE.A,
            class: Packet.CLASS.IN,
            ttl: 1,
            address: '8.8.8.4'
        });
        send(response);
    }
});

server.on('request', (request, response, rinfo) => {
    console.log(request.header.id, request.questions[0]);
});

server.on('listening', () => {
    console.log('Listenning');
});

server.on('close', () => {
    console.log('server closed');
});

server.listen({
    udp: 53
});

