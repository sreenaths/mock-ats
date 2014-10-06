mock-ats
========

- Just a mock ATS for serving data locally.
- The server expects data to be in the ***data*** directory.

###Installation
Just ensure nodejs is installed!

###Starting
- Run `node server.js` from this directory. Server would start on port *8188* by default.
- `node server.js <port>` for running on a specific port.
- Want to run it in background, use **forever**.

 `npm install -g forever` and then `forever start server.js`