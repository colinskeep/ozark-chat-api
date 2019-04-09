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
    dbase2 = db.db('users');
    dbase.createCollection('message', {
      validator: { $or: [
        {toUser: {$type: 'string'}},
        {toUserId: {$type: 'string'}},
        {fromUser: {$type: 'string'}},
        {fromUserId: {$type: 'string'}},
        {message: {$type: 'string'}},
        {type: {$type: 'string'}},
        {datetime: {type: 'string'}}
      ]},
    });
    registrationCollection = dbase2.collection('registrations');
    messageCollection = dbase.collection('message');
    changeStream = messageCollection.watch(pipeline);
    changeStream.on('change', async function(change) {
      try {
        console.log(change.fullDocument);
        let activeUserConnections = arr.filter(function(item) {
          const userId = item.userId.toString().trim();
          const toUserId = change.fullDocument.toUserId.toString().trim();
          if (userId == toUserId) {
            return true;
          }
        })
        console.log('send to:', activeUserConnections);
        let index = activeUserConnections.map(function(e) {return e.socketid})
        for (var i = 0; i < index.length; i++) {
          io.to(`${index[i]}`).emit('message', [{
            messageId: `${change.fullDocument._id}`,
            toUser: `${change.fullDocument.toUser}`,
            toUserId: `${change.fullDocument.toUserId}`,
            fromUser: `${change.fullDocument.fromUser}`,
            fromUserId: `${change.fullDocument.fromUserId}`,
            message: `${change.fullDocument.message}`,
            type: 'message',
            time: `${change.fullDocument.datetime}`,
          }]);
          console.log('sending message:', change.fullDocument.message, 'to user: ', index[i]);
        }
      } catch (err) {console.log(err)}
    });
  } else if (err) {
    console.log(err);
  }
});

io.on('connection', async (socket) => {
  console.log('jwt: ', socket.handshake.query.jwt);
  const user = await jwt.resolve(socket.handshake.query.jwt);
  const name = await registrationCollection.findOne({email: user.email});
  console.log(socket.handshake.query.lastMessage);
  const messages = await messageCollection.find({toUserId: name._id, datetime: {$gt: socket.handshake.query.lastMessage}});
  console.log(messages);
  arr.push({
    socketid: socket.conn.id,
    userId: name.id,
    username: name.username,
    datetime: Math.floor(new Date() / 1000),
  });
  console.log(arr);

  socket.on('message', async function(value) {
    console.log(socket.conn.id);
    const toUserId = await registrationCollection.findOne({username: value.username});
    messageCollection.insertOne({
      toUser: value.username,
      toUserId: toUserId.id,
      fromUser: name.username,
      fromUserId: name.id,
      message: value.message,
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
