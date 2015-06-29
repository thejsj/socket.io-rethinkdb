
/**
 * Module dependencies.
 */

var uid2 = require('uid2');
var r = require('rethinkdb');
require('rethinkdb-init')(r);
var Adapter = require('socket.io-adapter');
var Emitter = require('events').EventEmitter;
var debug = require('debug')('socket.io-rethinkdb');

/**
 * Module exports.
 */

module.exports = adapter;

/**
 * Returns a RethinkDB Adapter class.
 *
 * @param {String} optional, rethinkdb uri
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
  var port = +(opts.port || 28015);
  var db = opts.db || 'socketio_rethinkdb';
  var conn_opts = { host: host, port: port, db: db };
  var save_messages = +(opts.save_messages || false);
  var durability_hard = +(opts.durability || false);
  var durability = (durability_hard) ? 'hard' : 'soft';

  // this server's key
  var server_uid = uid2(6);

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
      return r.table('messages')
        // Don't listen to messages from this server
        .filter(r.row('server_uid').ne(server_uid))
        .changes()
        .run(conn)
        .then(function (cursor) {
          cursor.each(function (err, change) {
            // Only listen to inserts
            if (change.old_val === null) {
              if (err) self.emit('error', err);
              var message = JSON.parse(change.new_val.message);
              this.onmessage(null, message);
            }
          }.bind(this));
      }.bind(this));
    }.bind(this))
    .catch(function (err) {
      console.error('socket.io-rethinkdb: Error creating database', err);
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

  RethinkDBAdapter.prototype.onmessage = function(pattern, msg){
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
      if (opts.rooms === undefined) opts.rooms = null;
      return this.init.then(function () {
        return r.connect(conn_opts).then(function (conn) {
          var message = JSON.stringify([packet, opts]);
          return r.db(conn_opts.db).table('messages').insert({
            server_uid: server_uid,
            message: message
          })
          .run(conn, { durability: durability })
          .then(function (res) {
            // Delete all keys
            if (save_messages) return true;
            return r.db(conn_opts.db).table('messages')
              .getAll(r.args(res.generated_keys))
              .delete()
              .run(conn, { durability: durability });
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
