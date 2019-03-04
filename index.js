require('dotenv').config();
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const MongoClient = require('mongodb').MongoClient;
const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}`;

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
        let index = arr.map(function(e) {return e.socketid}).indexOf(change.fullDocument.to);
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

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  arr.push({
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
    arr.splice(arr.map(function(e) {
      return e.socketid}).indexOf(socket.conn.id), 1);
  });
});

http.listen(9000, function() {
  console.log('listening on *:9000');
});
