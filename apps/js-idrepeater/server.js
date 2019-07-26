const config = require('./config');
var express = require("express");
var app = express();

const myId = function uuidv4() {
    return 'xxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}();

app.get("/", (req, res, next) => {
    res.send(myId);
    //res.json(myId);
    console.log(myId);
});

app.listen(config.port);
console.log('Listening on localhost:' + config.port);