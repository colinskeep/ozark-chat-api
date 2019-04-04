require('dotenv').config();
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const MongoClient = require('mongodb').MongoClient;
const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}`;
const jwt = require('./jwt.js');

let arr = [];
const pipeline = [
  {
    $project: { documentKey: false }
  }
];

MongoClient.connect(url, function(err, db) {
  if (!err) {
    dbase = db.db(process.env.DB_NAME);
    dbase.createCollection('message', {
      validator: { $or: [
        {to: {$type: 'string'}},
        {from: {$type: 'string'}},
        {message: {$type: 'string'}},
        {type: {$type: 'string'}},
        {datetime: {type: 'string'}}
      ]},
    });
    messageCollection = dbase.collection('message');
    changeStream = messageCollection.watch(pipeline);
    changeStream.on('change', async function(change) {
      try {
        let index = arr.map(function(e) {return e.username}).indexOf(change.fullDocument.to);
        if (index > -1) {
          io.to(`${arr[index].socketid}`).emit(`${change.fullDocument.message}`);
          console.log('sending message:', change.fullDocument.message, 'to user: ', arr[index].socketid);
        }
      } catch (err) {console.log(err)}
    });
  } else if (err) {
    console.log(err);
  }
});

io.on('connection', async (socket) => {
  const user = await jwt.resolve(socket.handshake.query.jwt);
  console.log(user);
  arr.push({
    socketid: socket.conn.id,
    username: user.username,
    datetime: Math.floor(new Date() / 1000),
  });
  console.log(arr);

  socket.on('message', function(value) {
    messageCollection.insertOne({
      to: value.to,
      from: user.username,
      message: value.message,
      type: value.type,
      datetime: Math.floor(new Date() / 1000),
    })
    console.log(value);
  });

  socket.on('disconnect', () => {
    arr.splice(arr.map(function(e) {
      return e.socketid}).indexOf(socket.conn.id), 1);
    console.log(arr);
  });
});

http.listen(process.env.PORT, function() {
  console.log('listening');
});
