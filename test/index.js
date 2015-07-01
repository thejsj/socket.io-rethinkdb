var http = require('http').Server;
var io = require('socket.io');
var ioc = require('socket.io-client');
var expect = require('expect.js');
var adapter = require('../');
var integrationTester = require('./integration');
var r = require('rethinkdb');
require('rethinkdb-init')(r);

before(function (done) {
  this.timeout(5000);
  return r.connect({ db: 'socketio_rethinkdb'})
    .then(function (conn) {
      return r.dbDrop('socketio_rethinkdb').run(conn)
        .catch(function (err) {
          if (err.message.indexOf('does not exist') === -1) {
            throw err;
          }
        })
        .then(function () {
          return r.init({ db: 'socketio_rethinkdb'}, [ 'messages' ]);
        });
    })
    .nodeify(done);
});

after(function (done) {
  return r.connect({ db: 'socketio_rethinkdb'})
    .then(function (conn) {
      return r.dbDrop('socketio_rethinkdb').run(conn);
    })
    .nodeify(done);
});

describe('socket.io-rethinkdb', function () {

  var interval, messages;
  afterEach(function (done) {
    return r.connect({ db: 'socketio_rethinkdb'})
      .then(function (conn) {
        return r.db('socketio_rethinkdb').table('messages').delete().run(conn);
      })
      .nodeify(done);
  });

  it('broadcasts', function(done){
    create(function(server1, client1){
      create(function(server2, client2){
        client1.on('woot', function(a, b){
          expect(a).to.eql([]);
          expect(b).to.eql({ a: 'b' });
          done();
        });
        client1.on('error', done);
        server2.on('error', done);
        server2.on('connection', function(c2){
          c2.broadcast.emit('woot', [], { a: 'b' });
        });
      });
    });
  });

  it('broadcasts to rooms', function(done){
    create(function(server1, client1){
      create(function(server2, client2){
        create(function(server3, client3){
          client1.on('broadcast', function () {
            setTimeout(done, 100);
          });

          [client2, client3].forEach(function (client) {
            client.on('broadcast', function(){
              throw new Error('Not in room');
            });
            client.on('error', done);
          });

          server1.on('connection', function(c1){
            c1.join('woot');
          });

          server2.on('connection', function(c2){
            // does not join, performs broadcast
            c2.on('do broadcast', function(){
              c2.broadcast.to('woot').emit('broadcast');
            });
          });

          server3.on('connection', function (c3) {
            // does not join, signals broadcast
            client2.emit('do broadcast');
          });
        });
      });
    });
  });

  interval = 25, messages = 100;
  it('should not lose ' + messages + ' messages when they are ' + interval + 'ms apart', function (done) {
    this.timeout(10000);
    integrationTester({
      interval: interval,
      messages: messages,
      log: false,
      validateOrder: false,
      callback: done,
    });
  });

  interval = 75, messages = 75;
  it('should not lose the order of ' + messages + ' messages when they are ' + interval + 'ms apart', function (done) {
    this.timeout(10000);
    integrationTester({
      interval: 100,
      messages: 50,
      log: false,
      // Currently, this doesn't work if we use the same ports
      ports: [3001, 4001],
      validateOrder: true,
      callback: done,
    });
  });

  // create a pair of socket.io server+client
  function create(nsp, fn){
    var srv = http();
    var sio = io(srv);
    sio.adapter(adapter());
    srv.listen(function(err){
      if (err) throw err; // abort tests
      if ('function' == typeof nsp) {
        fn = nsp;
        nsp = '';
      }
      nsp = nsp || '/';
      var addr = srv.address();
      var url = 'http://localhost:' + addr.port + nsp;
      fn(sio.of(nsp), ioc(url));
    });
  }

});
