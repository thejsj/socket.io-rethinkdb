# socket.io-rethinkdb

[![Build Status](https://travis-ci.org/thejsj/socket.io-rethinkdb.svg?branch=master)](https://travis-ci.org/thejsj/socket.io-rethinkdb)
[![NPM version](https://badge.fury.io/thejsj/socket.io-rethinkdb.svg)](http://badge.fury.io/js/socket.io-rethinkdb)

## How to use

```js
var io = require('socket.io')(3000);
var rethinkdb = require('socket.io-rethinkdb');
io.adapter(redis({ host: 'localhost', port: 28015 }));
```

## API

### adapter(uri[, opts])

`uri` is a string like `localhost:28015` where your rehtinkdb instance
is located. For a list of options see below.

### adapter(opts)

The following options are allowed:

- `host`: host to connect to redis on (`localhost`)
- `port`: port to connect to redis on (`28015`)
- `db`: database in which to store messages (`socketio_rethinkdb`)
- `save_messages`: whether the database should keep sent message (or delete them automatically) (`false`)
- `durability_hard`: whether messages have to be written to disk before being acknowledged (`false`)

## When to use

Because of the differences between Redis and RethinkDB, it's not best to use this 
driver over [socket.io-redis](http://github.com/Automattic/socket.io-redis). 
Redis' pub/sub mechanism (which socket.io-redis uses) is not persistent and 
doesn't save your messages to the database. For that reasons, it's faster 
and can handle more messages being concurrently saved to it. 

Hence, you should use this module instead of socket.io-redis if:

1. RethinkDB is alreaydy part of your stack and you don't want another database
2. You need your messages to be persistent

## Guarantees

Messages broadcasted/emitted through the socket connection are guaranteed to 
be written, if acknowledged. But, because of the nature of changefeeds, messages 
are not guaranteed to be delivered. This is similar to the guarantees currently 
provided by Redis pub/sub and socket.io-redis.

## Credit

This module is a fork of [socket.io-redis](http://github.com/Automattic/socket.io-redis).

## License

MIT
