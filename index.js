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
        let activeUserConnections = arr.filter(function(item) {
          if (item.userId.toString().trim() == change.fullDocument.toUserId.toString().trim()) {
            return true;
          }
          if (item.userId.toString().trim() == change.fullDocument.fromUserId.toString().trim()) {
            return true;
          }
        })
        console.log('send to:', activeUserConnections);
        let index = activeUserConnections.map(function(e) {return e.socketid})
        for (var i = 0; i < index.length; i++) {
          io.to(`${index[i]}`).emit('message', [{
            _id: `${change.fullDocument._id}`,
            toUser: `${change.fullDocument.toUser}`,
            toUserId: `${change.fullDocument.toUserId}`,
            fromUser: `${change.fullDocument.fromUser}`,
            fromUserId: `${change.fullDocument.fromUserId}`,
            message: `${change.fullDocument.message}`,
            type: 'message',
            datetime: `${change.fullDocument.datetime}`,
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
  const user = await jwt.resolve(socket.handshake.query.jwt);
  const name = await registrationCollection.findOne({email: user.email});
  const userId = name._id.toString().trim();
  console.log(socket.handshake.query.lastMessage);
  const messages = await messageCollection.find({$or: [{toUserId: userId, fromUserId: userId}]/*, datetime: {$gt: parseInt(socket.handshake.query.lastMessage)}*/}).toArray();
  let uniqueConvo = [];
  for (let i = 0, convo = []; i < messages.length; i++) {
    convo.push(messages[i].toUserId);
    convo.push(messages[i].fromUserId);
    if (i == messages.length - 1) {
      console.log(convo);
      filtered = [...new Set(convo)];
      console.log(filtered);
      uniqueConvo = filtered.splice(filtered.indexOf(userId), 1);
      console.log(uniqueConvo);
    }
  }

  if (messages.length > 0) {
    io.to(`${socket.conn.id}`).emit('message', messages);
  }
  arr.push({
    socketid: socket.conn.id,
    userId: userId,
    username: name.username,
    datetime: Math.floor(new Date() / 1000),
  });

  socket.on('message', async function(value) {
    const toId = await registrationCollection.findOne({username: value.username});
    const toUserId = toId._id.toString();
    const fromUserId = name._id.toString();
    messageCollection.insertOne({
      toUser: value.username,
      toUserId: toUserId,
      fromUser: name.username,
      fromUserId: fromUserId,
      message: value.message,
      datetime: Math.floor(new Date() / 1000),
    })
    console.log(value);
  });

  socket.on('disconnect', () => {
    arr.splice(arr.map(function(e) {
      return e.socketid}).indexOf(socket.conn.id), 1);
  });
});

http.listen(process.env.PORT, function() {
  console.log('listening');
});
