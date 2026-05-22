const express = require("express");
const http = require("http");
const { initSocket } = require("./socket");

const cors = require("cors");
const port = process.env.PORT || 3001;

const app = express();
app.use(cors());
const server = http.createServer(app);

app.get('/healthCheck', (req, res) => {
    res.send('OK');
})

const io = initSocket(server);


server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});