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
    dbase.createCollection('conversations', {
      validator: { $or: [
        {participantIds: {$type: 'array'}},
        {convo: {$type: 'array'}},
      ]},
    });
    registrationCollection = dbase2.collection('registrations');
    messageCollection = dbase.collection('conversations');
    changeStream = messageCollection.watch(pipeline);
    changeStream.on('change', async function(change) {
      try {
        let sendTo = change.fullDocument.participantIds.map(function(e) {return e.userId});
        let activeUserConnections = arr.filter(function(item) {
          if (sendTo.indexOf(item.userId.toString().trim()) > -1) {
            return true;
          }
        })
        console.log(change.fullDocument);
        console.log('send to:', activeUserConnections);
        let index = activeUserConnections.map(function(e) {return e.socketid})
        for (var i = 0; i < index.length; i++) {
          io.to(`${index[i]}`).emit('conversations', [{
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
  const messages = await messageCollection.find({participantIds: {$elemMatch:{userId: userId}}},{$project: { participantIds: 1, convo: {$slice: -1}}}).toArray();
  console.log(messages);
  if (messages.length > 0) {
    //remove your own userid from participantIds so the front end can process
    let objects = [];
    for (let i = 0; i < messages.length; i++) {
      let otherUserIds = messages[i].participantIds.filter(function(item){
        if (item.userId !== userId) {
          return true;
        }
      });
      if (otherUserIds.length < 1) {
        otherUserIds.push({userId: userId, username: name.username});
      }
      objects.push({
        conversationId: messages[i]._id,
        participantIds: otherUserIds,
        lastMessage: messages[i].convo[0],
      })
    }
    io.to(`${socket.conn.id}`).emit('conversations', objects);
  }
  arr.push({
    socketid: socket.conn.id,
    userId: userId,
    username: name.username,
    datetime: Math.floor(new Date() / 1000),
  });

  socket.on('newconvo', async function(value) {
    const toId = await registrationCollection.findOne({username: value.username});
    const toUserId = toId._id.toString();
    const fromUserId = name._id.toString();
    console.log(toUserId, fromUserId);
    messageCollection.insertOne({
      participantIds: [{
        userId: toUserId,
        username: value.username
      },
      {
        userId: fromUserId,
        username: name.username
      }],
      convo: [{
        fromUserId: fromUserId,
        fromUser: name.username,
        message: value.message,
        datetime: Math.floor(new Date() / 1000),
      }],
    })
  });

  socket.on('conversations', async function(value) {
    const toId = await registrationCollection.findOne({username: value.username});
    const toUserId = toId._id.toString();
    const fromUserId = name._id.toString();
    console.log(toUserId, fromUserId);
    messageCollection.update({_id: value.id},
      {$addToSet: {
        convo: {
          fromUserId: fromUserId,
          fromUser: name.username,
          message: value.message,
          datetime: Math.floor(new Date() / 1000),
        },
      }}
    );
  });
  socket.on('conversationId', async function(value) {
    console.log(value);
    console.log(value.conversationId);
    const messages = await messageCollection.findOne({_id: value.conversationId});
    console.log(messages);
    io.to(`${socket.conn.id}`).emit('conversationId', messages);
  })

  socket.on('disconnect', () => {
    arr.splice(arr.map(function(e) {
      return e.socketid}).indexOf(socket.conn.id), 1);
  });
});

http.listen(process.env.PORT, function() {
  console.log('listening');
});

app.get('/', function(req, res) {
   res.sendFile('index.html');
});
