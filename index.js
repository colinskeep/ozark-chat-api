require('dotenv').config();
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const MongoClient = require('mongodb').MongoClient;
const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}`;

const pipeline = [
  {
    $project: { documentKey: false }
  }
];

//todo: dont save connected users to database, save users to array on node
MongoClient.connect(url, function(err, db) {
  if (!err) {
    dbase = db.db(process.env.DB_NAME);
    dbase.createCollection('active', {
      validator: { $or: [
        {socketid: {$type: 'string'}},
        {id: {$type: 'string'}},
        {datetime: {$type: 'string'}},
      ]},
    });
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
    activeCollection = dbase.collection('active');
    changeStream = messageCollection.watch(pipeline);
    changeStream.on('change', async function(change) {
      try {
        const toUser = await activeCollection.findOne({id: change.fullDocument.to});
        if (toUser) {
          io.to(`${toUser.socketid}`).emit(`${change.fullDocument.message}`);
          console.log('sending message:', change.fullDocument.message, 'to user: ', toUser.socketid);
        }
      } catch (err) {console.log(err)}
    });
  } else if (err) {
    console.log(err);
  }
});

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  activeCollection.insertOne({
    socketid: socket.conn.id,
    jwt: socket.handshake.query.user,
    datetime: Math.floor(new Date() / 1000),
  });

  socket.on('message', function(value) {
    messageCollection.insertOne({
      to: value.to,
      from: value.from,
      message: value.message,
      type: value.type,
      datetime: Math.floor(new Date() / 1000),
    })
  });

  socket.on('disconnect', () => {
    activeCollection.findOneAndDelete({socketid: socket.conn.id});
  });
});


http.listen(9000, function() {
  console.log('listening on *:9000');
});
