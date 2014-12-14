mock-ats
========
Provides a mock timeline server for testing and development. Fixture data can be pulled directly from timeline server using get-ats-dump script. They can also be added manually into the data folder.  
Supports: fromId, limit, primaryFilter, secondaryFilter

###Installation
Install node and then  
`npm install`

###Get timelien data dump
`node get-ats-dump.js <timeline url>`  
The dump will be put into **data** directory.

###Starting server
 `node server.js [<tez-ui url> <port>]`
- Default tez-ui url is http://localhost:9001, for accessing mock-ats from another url pass the same as first argument.
- Server would start on port *8188* by default.
- Want to run it in background, use **forever**.  
 `npm install -g forever` and then `forever start server.js`