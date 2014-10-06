"use strict"

/*
	A mock Timeline Server
*/

var http = require('http'),
	url = require('url'),
	path = require('path'),
	fs = require('fs'),

	port = parseInt(process.argv[2], 10) || 8188;

http.createServer(function(request, response) {
	var filename = path.join(process.cwd(), 'data/' + url.parse(request.url).pathname);
	
	process.stdout.write("Resuested for " + filename + " :");

	fs.exists(filename, function(exists) {
		if(!exists) {
			response.writeHead(404, {'Content-Type': 'text/plain'});
			response.write('404 Not Found\n');
			console.log(" Err:Not Found");
			response.end();
		}
		else {
			if (fs.statSync(filename).isDirectory()) filename = path.join(filename, '/index.json');

			fs.readFile(filename, "binary", function(err, file) {
				if(err) {				
					response.writeHead(500, {"Content-Type": "application/json"});
					response.write(err + "\n");
					console.log(" Err:" + err);
					response.end();
				}
				else {
					response.writeHead(200);
					response.write(file, "binary");
					console.log(" Success!");
					response.end();
				}
			});
		}
	});
}).listen(port, function(err){
	if(err) {
		console.log("Unable to listen : ", err);
	}
	else {
		console.log("Timeline Server running at http://localhost:" + port + "/\nUse CTRL+C to shutdown");
	}
});

