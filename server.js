const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;

// HTTP server - serves the HTML client
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(500); res.end('Error'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// WebSocket server
const wss = new WebSocket.Server({ server });

let users = {}; // { ws: { username, room } }

function broadcast(room, data, senderWs = null) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const user = users[client];
      if (user && user.room === room) {
        if (senderWs === null || client !== senderWs) {
          client.send(JSON.stringify(data));
        }
      }
    }
  });
}

function broadcastAll(room, data) {
  broadcast(room, data, null);
}

function getRoomUsers(room) {
  return Object.values(users).filter(u => u.room === room).map(u => u.username);
}

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      users[ws] = { username: msg.username, room: msg.room };
      console.log(`${msg.username} joined room: ${msg.room}`);

      // Notify everyone in room
      broadcastAll(msg.room, {
        type: 'system',
        text: `${msg.username} joined the chat`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        users: getRoomUsers(msg.room)
      });

      // Send current user list to the joining user
      ws.send(JSON.stringify({
        type: 'welcome',
        text: `Welcome, ${msg.username}! You joined room: ${msg.room}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        users: getRoomUsers(msg.room)
      }));
    }

    if (msg.type === 'message') {
      const user = users[ws];
      if (!user) return;
      const payload = {
        type: 'message',
        username: user.username,
        text: msg.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      // Send to everyone in room including sender
      broadcastAll(user.room, payload);
    }

    if (msg.type === 'typing') {
      const user = users[ws];
      if (!user) return;
      broadcast(user.room, {
        type: 'typing',
        username: user.username
      }, ws);
    }
  });

  ws.on('close', () => {
    const user = users[ws];
    if (user) {
      delete users[ws];
      broadcastAll(user.room, {
        type: 'system',
        text: `${user.username} left the chat`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        users: getRoomUsers(user.room)
      });
    }
    console.log('Connection closed');
  });
});

server.listen(PORT, () => {
  console.log(`✅ Chat server running at http://localhost:${PORT}`);
  console.log(`   Share this with others on same network: http://<your-ip>:${PORT}`);
});
