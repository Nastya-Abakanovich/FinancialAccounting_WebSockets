const jwt = require('jsonwebtoken');
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
const fs = require('fs');
var path = require('path');

const app = express();
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
app.use(bodyParser.json());
app.use(express.static('public'));

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

    socket.use((packet, next) => {
        if (packet[0] === 'getData' || packet[0] === 'delete' || packet[0] === 'add'
            || packet[0] === 'getFile' || packet[0] === 'deleteFile' || packet[0] === 'update') {
            authMiddleware(socket, next);
        } else {
            next();
        }
    });

    socket.on('getData', () => {
        console.log('getData');

        const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
        if (cookies && cookies.id) {
            connection.query('SELECT * FROM Spending WHERE user_id = ' + cookies.id, function (err, result) {
            if (err) 
                socket.emit('getDataResponse', 'Getting data error');
            else 
                socket.emit('getDataResponse', result);
            });  
        } else {
            socket.emit('getDataResponse', 'Getting data error');
        }
    });

    socket.on('getFile', (id) => {
        console.log('getFile');

        const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
        if (cookies && cookies.id) {
            connection.query('SELECT filename FROM Spending WHERE user_id = ' + cookies.id + ' AND spending_id = ' + id, 
            function (err, selectResult) {
                if (err) return socket.emit('getFileResponse', 'Getting file error');             
                socket.emit('getFileResponse', {file: fs.readFileSync('./public/uploads/' + id + 
                            path.extname(selectResult[0].filename)), filename: selectResult[0].filename})
        });
        } else {
            socket.emit('getFileResponse', 'Getting file error');
        }
    });

    socket.on('delete', (id) => {
        console.log('delete');

        const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
        if (cookies && cookies.id) {
            connection.query('DELETE FROM Spending WHERE spending_id=' + id 
                            + ' AND user_id=' + cookies.id, function (err, result) {
                if (err) return socket.emit('deleteResponse', 'Deletion error');
                if (result.affectedRows === 0)
                    socket.emit('deleteResponse', 'Unable delete item');
                else
                    socket.emit('deleteResponse', 'Successfully deleted');    
            });
        } else {
            socket.emit('deleteResponse', 'Deletion error');
        }
    });

    socket.on('deleteFile', (id) => {
        console.log('deleteFile');

        const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
        if (cookies && cookies.id) {
            connection.query('SELECT filename FROM Spending WHERE user_id = ' + cookies.id + ' AND spending_id = ' 
                            + id, function (err, selectResult) {
                if (err) return socket.emit('deleteFileResponse', 'Deletion file error');

                connection.query('UPDATE Spending SET filename = null WHERE spending_id = ?  AND user_id = ?',
                [
                id,
                cookies.id
                ], function (err, result) {
                    if (err) throw err;
                    fs.unlink('./public/uploads/' + id + path.extname(selectResult[0].filename), function(err){
                        if (err) 
                            socket.emit('deleteFileResponse', 'Deletion file error');
                        else    
                            socket.emit('deleteFileResponse', 'Successfully deleted file');
                    });          
                });
            });
        } else {
            socket.emit('deleteFileResponse', 'Deletion file error');
        }
    });

    socket.on('add', (body, file) => {
        console.log('add');

        if(!body) return socket.emit('addResponse', 'Adding error');     

        const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
        if (cookies && cookies.id) {
            connection.query('INSERT Spending(user_id, sum, date, category, description, income, filename) VALUES (?,?,?,?,?,?,?)',
            [
                cookies.id, 
                body.sum * 100,
                body.date,
                body.category,
                body.description,
                body.type === 'income',
                file ? file.name : null
            ], function (err, result) {
                if (err) throw err;

                if (file) {
                    fs.writeFile('./public/uploads/' + result.insertId  + path.extname(file.name), file.info, function(error){
                        if(error) throw error;
            }); 
            }
            socket.emit('addResponse', {id: result.insertId, body: body, filename: file ? file.name : null});
            }); 
        } else {
            socket.emit('addResponse', 'Adding error');
        }
    });

    socket.on('update', (body, file) => {
        console.log('update');

        if(!body) return socket.emit('updateResponse', 'Updating error');

        const cookies = cookie.parse(socket.handshake?.headers?.cookie === undefined ? "" : socket.handshake.headers.cookie);
        if (cookies && cookies.id) {
            if (file !== null) {
                connection.query('SELECT filename FROM Spending WHERE user_id = ' + cookies.id + ' AND spending_id = ' 
                                + body.spending_id, function (err, selectResult) {
                    if (err) return socket.emit('updateResponse', 'Updating error');

                    if (selectResult[0].filename !== null) {
                        fs.unlink('./public/uploads/' + body.spending_id + path.extname(selectResult[0].filename), function(err){
                            if (err) throw err;
                });  
            }

            connection.query('UPDATE Spending SET sum = ?, date = ?, category = ?, description = ?, income = ?, filename = ? ' +
                            'WHERE spending_id = ?  AND user_id = ?',
            [
                body.sum * 100,
                body.date,
                body.category,
                body.description,
                body.type === 'income',
                file.name,
                body.spending_id,
                cookies.id
            ], function (err, result) {
                if (err) throw err;
                fs.writeFile('./public/uploads/' + body.spending_id  + path.extname(file.name), file.info, function(error){
                    if(error) throw error;
                    socket.emit('updateResponse', {user_id: cookies.id, body: body, filename: file.name});
                });                         
            }); 
            });
            } else {
                connection.query('UPDATE Spending SET sum = ?, date = ?, category = ?, description = ?, income = ? ' +
                                 'WHERE spending_id = ?  AND user_id = ?',
                [
                    body.sum * 100,
                    body.date,
                    body.category,
                    body.description,
                    body.type === 'income',
                    body.spending_id, 
                    cookies.id
                ], function (err, result) {
                    if (err) throw err;
                    socket.emit('updateResponse', {user_id: cookies.id, body: body, filename: null});
                }); 
            }
        } else {
            socket.emit('updateResponse', 'Updating error');
        }
    });

    socket.on('login', (data) => {
        console.log('login');

        if(!data) return socket.emit('loginResponse', 'Login error');

        connection.query('SELECT * FROM Users WHERE email = \'' + data.email + '\'',
                        function (err, result) {
            if (err) return socket.emit('loginResponse', 'Login error');
            if (result.length === 0) {
                return socket.emit('loginResponse', 'User not found');    
            } else {
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

server.listen(port, () => {
    console.log('Listening on port ', port);
});