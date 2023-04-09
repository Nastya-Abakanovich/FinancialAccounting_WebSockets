const jwt = require('jsonwebtoken');
const multer = require('multer');
const bodyParser = require('body-parser'); 
const mysql = require("mysql2");
const dbConfig = require("./config/db.config.js");
const jwtConfig = require("./config/jwt.config.js");
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const http = require('http');
const express = require("express");
const cookie = require("cookie");
const socketIO = require('socket.io');

const app = express();
const urlencodedParser = express.urlencoded({extended: false});
const server = http.createServer(app);
const io = socketIO(server, {
    cookie: true,
    cors: {
        origin: "http://localhost:3000",
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"]
    }
  });

  app.use(cookieParser());

const port = 5000;
const saltRounds = 10;

const connection = mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    password: dbConfig.password
});

connection.connect(function(err){
    if (err) {
        return console.error("Ошибка: " + err.message);
    }
    else {
        console.log("Подключение к серверу MySQL успешно установлено");    
    }
}); 

const authMiddleware = (socket, next) => {
    console.log('checkAuth.');

    try {
        const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
        if (cookies && cookies.token) {      
            const decoderData = jwt.verify(cookies.token, jwtConfig.secretKey);            
            console.log(decoderData);
            // console.log('--------------');
            next();             
        } else {
            next(new Error('Authentication error'));
        }
    } catch (e) {
        console.log(e);
        next(new Error('Authentication error'));
    }     
  };

io.on('connection', (socket) => {

  console.log('A client ' + socket.id + ' connected.');

  socket.on('error', (error) => {
    if (error.message === 'Authentication error') {
         socket.emit('goToSignIn');
    } else {
        console.log('Socket error:', error);
    }
  });  

  socket.on('disconnect', () => {
    console.log('A client ' + socket.id + ' disconnected.');
  });

    // middleware применяется только для события "getData"
    socket.use((packet, next) => {
        if (packet[0] === 'getData') {
          authMiddleware(socket, next);
        } else {
          next();
        }
      });

  socket.on('getData', () => {
    console.log('getData');

    const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
    if (cookies && cookies.id) {
        connection.query('SELECT * FROM Spending WHERE user_id = ' + cookies.id, function (err, result) { // req.cookies.user.id
            if (err) 
                socket.emit('getDataResponse', 'Getting data error');
            else 
                socket.emit('getDataResponse', result);
        });  
    } else {
        socket.emit('getDataResponse', 'Getting data error');
    }

  });

  socket.on('login', (data) => {
    console.log('login');

    if(!data) return socket.emit('loginResponse', 'Login error');
    console.log(data.email);

    connection.query('SELECT * FROM Users WHERE email = \'' + data.email + '\'',
    function (err, result) {
        if (err) return socket.emit('loginResponse', 'Login error');
        if (result.length === 0) {
            return socket.emit('loginResponse', 'User not found');    
        } else {
            console.log(result);
            const isCorrectValue = bcrypt.compareSync(data.password, result[0].password);

            if (!isCorrectValue) {
                return socket.emit('loginResponse', 'Invalid password'); 
            } else {
                const token = jwt.sign({id: result[0].id, name: result[0].name}, jwtConfig.secretKey, {expiresIn: "1h"});

                socket.emit('loginResponse',  { token: 'token=' +  token, id: 'id=' + result[0].id});
            }
        }
    }); 
  });

    socket.on('register', (data) => {
        console.log('register');

        if(!data) return socket.emit('registerResponse', 'Register error');
        console.log(data.email);

        connection.query('SELECT * FROM Users WHERE email = \'' + data.email + '\'',
        function (err, result) {
            if (err) return socket.emit('registerResponse', 'Register error');

            var isDuplicateEmail = false;
            connection.query('SELECT * FROM Users', function (err, result) {
                if (err) return socket.emit('registerResponse', 'Register error');

                result.forEach(item => {
                    if (item.email === data.email) {
                        isDuplicateEmail = true;
                        return socket.emit('registerResponse', 'Email already exist');   
                    }
                });

                if (!isDuplicateEmail) {
                    const salt = bcrypt.genSaltSync(saltRounds);
                    const passHash = bcrypt.hashSync(data.password, salt);
                
                    connection.query('INSERT Users(name, email, password) VALUES (?,?,?)',
                    [
                    data.name,
                    data.email,
                    passHash
                    ], function (err, result) {
                        if (err) throw err;
                        const token = jwt.sign({id: result.insertId, name: data.name}, jwtConfig.secretKey, {expiresIn: "1h"});

                        return socket.emit('registerResponse',  { token: 'token=' +  token, id: 'id=' + result.insertId});
                    }); 
                }
            });
        }); 
    });
});


const storage = multer.diskStorage ({
    destination: (req, file, cb) =>{
        cb(null, "public/uploads");
    },
    filename: (req, file, cb) =>{
        cb(null, file.originalname);
    }
})
const upload = multer({storage: storage});

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));

// app.get('/api/:filename', (req, res) => {
//     res.status(200).sendFile(__dirname + '/public/uploads/' + req.params.filename, (err, file) => {
//         if (err) 
//             res.sendStatus(404)
//         else 
//             res.end(file);
//       });
// });

// app.delete("/api/:id", middleware, function(req, res){       
//     const id = req.params.id;
//     connection.query('DELETE FROM Spending WHERE spending_id=' + id 
//                         + ' AND user_id=' + req.cookies.user.id, function (err, result) {
//         if (err) res.sendStatus(400);
//         if (result.affectedRows === 0)
//             res.status(404).send({ message: 'Unable delete item' });
//         else
//             res.status(200).send({ message: 'Deleted item with id=' + id });       
//     });
// });

// app.post("/api", upload.single('fileToUpload'), urlencodedParser, middleware, function (req, res) {
      
//     if(!req.body) return res.sendStatus(400);     

//     connection.query('INSERT Spending(user_id, sum, date, category, description, income, filename) VALUES (?,?,?,?,?,?,?)',
//     [
//     req.cookies.user.id, 
//     req.body.sum * 100,
//     req.body.date,
//     req.body.category,
//     req.body.description,
//     req.body.type === 'income',
//     req.file ? req.file.originalname : null
//     ], function (err, result) {
//         if (err) throw err;
//         res.status(200).json({"spending_id": result.insertId});
//     }); 
// });

// app.put("/api", upload.single('fileToUpload'), urlencodedParser, middleware, function(req, res){
  
//     if(!req.body) return res.sendStatus(400);
    
//     console.log(req.body)
//     if (req.file !== null) {
//         connection.query('UPDATE Spending SET sum = ?, date = ?, category = ?, description = ?, income = ?, filename = ? WHERE spending_id = ?  AND user_id = ?',
//             [
//                 req.body.sum * 100,
//                 req.body.date,
//                 req.body.category,
//                 req.body.description,
//                 req.body.type === 'income',
//                 req.file ? req.file.originalname : null,
//                 req.body.spending_id,
//                 req.cookies.user.id
//             ], function (err, result) {
//                 if (err) throw err;
//                 res.status(200).send({ message: 'Update item with id=' + req.body.spending_id });
//             }); 
//     } else {
//         connection.query('UPDATE Spending SET sum = ?, date = ?, category = ?, description = ?, income = ? WHERE spending_id = ?  AND user_id = ?',
//         [
//             req.body.sum * 100,
//             req.body.date,
//             req.body.category,
//             req.body.description,
//             req.body.type === 'income',
//             req.body.spending_id, 
//             req.cookies.user.id
//         ], function (err, result) {
//             if (err) throw err;
//             res.status(200).send({ message: 'Update item with id=' + req.body.spending_id});
//         }); 
//     }
// });

// app.put("/api/deleteFile", upload.single('fileToUpload'), urlencodedParser, middleware, function(req, res){
  
//     if(!req.body) return res.sendStatus(400);
//     console.log(req.body)

//     connection.query('UPDATE Spending SET filename = null WHERE spending_id = ?  AND user_id = ?',
//         [
//             req.body.spending_id,
//             req.cookies.user.id
//         ], function (err, result) {
//             if (err) throw err;
//             res.status(200).send({ message: 'File delete from item with id=' + req.body.spending_id});
//         }); 

// });

server.listen(port, () => {
    console.log('Listening on port ', port);
});