
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
  var errorHandler = function (err) {
    debug(err);
    throw err;
  };

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
      return Promise.resolve()
        .then(function () {
          return r.table('messages')
            // Don't listen to messages from this server
            .filter(r.row('server_uid').ne(server_uid))
            .changes()
            .run(conn)
            .then(function (cursor) {
              cursor.each(function (err, change) {
                // Only listen to inserts
                if (change.old_val === null) {
                  if (err) {
                    debug(err);
                    self.emit('error', err);
                  }
                  //var opts = JSON.parse(change.new_val.opts);
                  this.onmessage(null, change.new_val.message, change.new_val.opts);
                }
              }.bind(this));
            }.bind(this));
      }.bind(this));
    }.bind(this))
    .catch(errorHandler);
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
  RethinkDBAdapter.prototype.onmessage = function(pattern, msg, opts){
    if (msg && msg.nsp === undefined && msg.nsp !== null) {
      msg.nsp = '/';
    }
    if (!msg || msg.nsp != this.nsp.name) {
      return debug('ignore different namespace');
    }
    this.broadcast.apply(this, [msg, opts, true]);
  };

  /**
   * Convert all undefined values to null
   *
   * @param {Object}
   * @return {Object}
   */
  RethinkDBAdapter.prototype.remove_undefined = function (obj) {
    if (Array.isArray(obj)) {
      obj.forEach(function (val, i) {
        if (val === undefined) {
          obj.splice(i, 1);
        }
      });
      return obj.map(function (value) {
        return this.remove_undefined(value);
      }.bind(this));
    } else if (typeof obj === 'object' && obj !== null) {
      for (var key in obj) {
        if (obj[key] === undefined) {
          delete obj[key];
        } else {
          obj[key] = this.remove_undefined(obj[key]);
        }
      }
      return obj;
    } else {
      return obj;
    }
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
    var self = this;
    Adapter.prototype.broadcast.call(this, packet, opts);
    if (!remote) {
      if (opts.rooms === undefined) opts.rooms = null;
      return this.init.then(function () {
        return r.connect(conn_opts).then(function (conn) {
          /**
           * Important:
           *
           * RethinkDB doesn't save values that are defined as `undefined` (which
           * makes all the sense in the world, if you ask me). Hence, in order
           * to make sure our data will get saved correctly, we delete all
           * values equal to `undefined`.
           */
          packet = self.remove_undefined(packet);
          opts = self.remove_undefined(opts);
          return r.db(conn_opts.db).table('messages').insert({
            server_uid: server_uid,
            message: packet,
            opts: opts
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
      })
      .catch(errorHandler);
    }
  };

  return RethinkDBAdapter;
}
