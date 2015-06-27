
/**
 * Module dependencies.
 */

var uid2 = require('uid2');
//var redis = require('redis').createClient;
var r = require('rethinkdb');
require('rethinkdb-init')(r);
//var msgpack = require('msgpack-js');
var Adapter = require('socket.io-adapter');
var Emitter = require('events').EventEmitter;
var debug = require('debug')('socket.io-redis');

/**
 * Module exports.
 */

module.exports = adapter;

/**
 * Returns a redis Adapter class.
 *
 * @param {String} optional, redis uri
 * @return {RethinkDBAdapter} adapter
 * @api public
 */

function adapter(uri, opts){
  opts = opts || {};

  // handle options only
  if ('object' == typeof uri) {
    opts = uri;
    uri = null;
  }

  // handle uri string
  if (uri) {
    uri = uri.split(':');
    opts.host = uri[0];
    opts.port = uri[1];
  }

  // opts
  var socket = opts.socket;
  var host = opts.host || '127.0.0.1';
  var port = Number(opts.port || 6379);
  var pub = opts.pubClient;
  var sub = opts.subClient;
  var prefix = opts.key || 'socket.io';
  var conn_opts = { host: host, port: 28015, db: 'socketio_rethinkdb' };

  // this server's key
  var uid = uid2(6);
  var key = prefix + '#' + uid;

  /**
   * Adapter constructor.
   *
   * @param {String} namespace name
   * @api public
   */

  function RethinkDBAdapter(nsp){
    Adapter.call(this, nsp);

    var self = this;
    this.init = r.init(conn_opts, [ 'messages' ])
    .then(function (conn) {
      return r.table('messages').changes().run(conn).then(function (cursor) {
        cursor.each(function (err, change) {
          // Only listen to inserts
          if (change.old_val === null) {
            if (err) self.emit('error', err);
            var message = JSON.parse(change.new_val.message);
            this.onmessage(null, change.new_val.key, message);
          }
        }.bind(this));
      }.bind(this));
    }.bind(this))
    .catch(function (err) {
      console.error('ERROR CREATING DB', err);
    });
  }

  /**
   * Inherits from `Adapter`.
   */

  RethinkDBAdapter.prototype.__proto__ = Adapter.prototype;

  /**
   * Called with a subscription message
   *
   * @api private
   */

  RethinkDBAdapter.prototype.onmessage = function(pattern, channel, msg){
    var pieces = channel.split('#');
    if (uid == pieces.pop()) {
      return debug('ignore same uid');
    }
    //var args = msgpack.decode(msg);

    if (msg[0] && msg[0].nsp === undefined) {
      msg[0].nsp = '/';
    }

    if (!msg[0] || msg[0].nsp != this.nsp.name) {
      return debug('ignore different namespace');
    }

    msg.push(true);

    this.broadcast.apply(this, msg);
  };

  /**
   * Broadcasts a packet.
   *
   * @param {Object} packet to emit
   * @param {Object} options
   * @param {Boolean} whether the packet came from another node
   * @api public
   */

  RethinkDBAdapter.prototype.broadcast = function(packet, opts, remote){
    Adapter.prototype.broadcast.call(this, packet, opts);
    if (!remote) {
      //pub.publish(key, msgpack.encode([packet, opts]));
      if (opts.rooms === undefined) opts.rooms = null;
      this.init.then(function () {
        return r.connect(conn_opts).then(function (conn) {
          var message = JSON.stringify([packet, opts]);
          return r.db(conn_opts.db).table('messages').insert({
            key: key,
            message: message
          })
          .run(conn, { durability: 'soft' })
          .then(function (res) {
            // Delete all keys
            return r.db(conn_opts.db).table('messages')
              .getAll(r.args(res.generated_keys))
              .delete()
              .run(conn, { durability: 'soft' });
          })
          .then(function () {
            conn.close();
          });
        });
      });
    }
  };

  return RethinkDBAdapter;

}
