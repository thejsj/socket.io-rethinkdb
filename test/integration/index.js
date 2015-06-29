var colors = require('colors');
var redisAdapter = require('socket.io-redis');
var socketioRethinkdb = require('../../index');
var http = require('http');
var socketio = require('socket.io');
var socketioClient = require('socket.io-client');

var serverIntervalIds, clientIntervalIds;
var getCounter = function () {
  var count = 0;
  return function () {
    return count++;
  };
};

var startServer = function (port, opts) {

  var log = function () {
    if (opts.log) {
      console.log.apply(console, arguments);
    }
  };
  var httpServer = http.Server();
  var io = socketio(httpServer);
  opts.io[port] = httpServer;
  var counter = getCounter();
  var connected = false;

  if (opts.adapter === 'redis') {
    io.adapter(redisAdapter({ host: 'localhost', }));
  } else if (opts.adapter === 'rethinkdb') {
    io.adapter(socketioRethinkdb({ host: 'localhost', }));
  } else {
    throw new Error('No adapter');
  }

  var emitMessage = function () {
    if (connected) {
      var count = counter();
      if (count < opts.messages) {
        // This message emitted by the server will get be received by all clients
        io.emit('message', { message: 'Hello from server (' + port + ')!', port: port, time: (new Date()).getTime(), id: count });
      }
    }
  };

  io.on('connection', function (socket) {
    connected = true;
    log('(Server: ' + port + ') New Connection');

    socket.on('message', function (data) {
      log('(Server: ' + port + ') Message:', JSON.stringify(data));
      // We need to emit this message to all other servers
      socket.broadcast.emit(data);
    });
  });

  httpServer.listen(port, function () {
    log('(Server: ' + port + ') Running on port', port);
  });

  return setInterval(emitMessage, opts.interval);
};

var startClient = function (port, opts) {
  var socket = socketioClient('http://localhost:' + port);
  opts.sockets[port] = socket;
  var counter = getCounter();
  var counts = {};
  var connected = false;
  var receivedMessages = {};
  var log = function () {
    if (opts.log) {
      console.log.apply(console, arguments);
    }
  };

  var emitMessage = function () {
    if (connected) {
      var count = counter();
      if (count < opts.messages) {
        // This message emitted by the client will only be received by its own server
        socket.emit('message', { message: 'Hello from Client (' + port + ')', port: port, time: (new Date()).getTime(), id: count });
      }
    }
  };

  socket.on('connect', function () {
    connected = true;
  });

  var finishJob = function () {
    serverIntervalIds.forEach(clearInterval);
    clientIntervalIds.forEach(clearInterval);
    log(colors.magenta('(Client: ' + port + ') Done'));
    for (var socketPort in opts.sockets) {
      opts.sockets[socketPort].disconnect();
    }
    for (var ioPort in opts.io) {
      opts.io[ioPort].close();
    }
    if (!opts.callbackCalled) {
      opts.callbackCalled = true;
      opts.callback();
    }
  };

  var errorJob = function (port) {
    log(colors.magenta('(Client: ' + port + ') Start timeout'));
    return setTimeout(function () {
      throw new Error('Not all messages received: Messages from other server were not received');
    }, opts.validateDeliveryTimeout);
  };

  var validateDeliveryTimeoutId;
  var total = ((opts.messages - 1) + 1) * ((opts.messages - 1) / 2);

  socket.on('message', function (data) {

    if (data.port !== port) {
      log(colors.green.bold('(Client: ' + port + ') Message', JSON.stringify(data)));
    } else {
      log(colors.gray('(Client: ' + port + ') Message', JSON.stringify(data)));
    }
    // Check if the order of messages is correct
    if (opts.validateOrder && data.id > 0 && counts[data.port] !== undefined && (data.id - 1) !== counts[data.port]) {
      log(colors.red(data.id, counts[data.port]));
      throw new Error('(Client) Count is off: ' + data.id + ' / '+ (counts[data.port] + 1));
    }
    counts[data.port] = data.id;
    receivedMessages[data.port] = (receivedMessages[data.port] === undefined) ? data.id : receivedMessages[data.port] + data.id;

    // Check messages
    if (opts.validateDelivery) {
      // Check if all messages have been delivered
      // If we have received all message in our port, start the timeout
      if (receivedMessages[data.port] === total) {
        if (data.port === port) {
          validateDeliveryTimeoutId = errorJob(port);
        } else {
          clearTimeout(validateDeliveryTimeoutId);
          // Strangely enough, Redis might be FASTER than not using Redis, so
          // we need to wait a bit until our memory messages get here
          setTimeout(function () {
            for (var portNum in receivedMessages) {
              if (receivedMessages[portNum] !== total) {
                throw new Error('(Client: ' + port + ') Not all messages received from port ' + portNum + ': ' + receivedMessages[portNum] +' should be ' + total);
              }
            }
            finishJob();
          }, 100);
       }
      }
    } else {
      if (data.id === opts.messages - 1) {
        finishJob();
      }
    }

  });

  socket.on('disconnect', function () {
    log('(Client: ' + port + ') Disconnect');
  });

  log('(Client: ' + port + ') Connecting on port ' + port);

  return setInterval(emitMessage, opts.interval);
};

module.exports = function (args) {
  var opts = function (args) {
    return {
      'adapter': args.adapter || 'rethinkdb',
      'interval': args.interval || 200,
      'ports': args.ports || [3000, 4000],
      'log': (args.log === 'false' || args.log === false) ? false : true,
      'messages': args.messages || 1000,
      'validateOrder': (args.validateOrder === 'false' || args.validateOrder === false) ? false : true,
      'validateDelivery': (args.validateDelivery === 'false' || args.validateDelivery === false) ? false : true,
      'validateDeliveryTimeout': args.validateDeliveryTimeout || 1000,
      'callback': args.callback || function () { },
      'callbackCalled': false,
      'io': {},
      'sockets': {},
    };
  }(args);
  serverIntervalIds = opts.ports.map(function (num) { return startServer(num, opts); });
  clientIntervalIds = opts.ports.map(function (num) { return startClient(num, opts); });
};

