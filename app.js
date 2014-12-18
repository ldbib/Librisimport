/*

Librisimport 1.0.0
Copyright 2014 Kristin Nordahl <kristin(dot)nordahl(at)ltdalarna(dot)se>
Copyright 2014 Landstinget Dalarna Bibliotek och informationscentral <webmaster(dot)lasarettsbiblioteken(at)ltdalarna(dot)se>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.
You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/


// cd /home/noakri/librisimport/; forever start -e /home/noakri/librisimport/error.log -a app.js

var url = require('url');
var util = require('util');
var request = require('request');
var sax = require('sax');
var http = require('http');
var querystring = require('querystring');
var Iconv = require('iconv').Iconv;

var server = http.createServer(function (req, res) {
	if(req.url.indexOf("favico") !== -1) {
		res.writeHead(404);
		return res.end();
	}
	var parsedURL = url.parse(req.url);
	parsedURL.query = querystring.parse(parsedURL.query);
	
	console.log("Connected!");
	console.log(req.url);
	
	var XMLParser = sax.createStream(true, { // true means XML parsing
		//trim: true, // Trims text and comment nodes
		normalize: true // Turnes any whitespace into a single space
	});
	
	var options = {
		host: 'lfexport.libris.kb.se',
		hostname: 'lfexport.libris.kb.se',
		path: '/LFExport/LFExport.aspx?LibraryCode='+parsedURL.query.LibraryCode+
			'&Type=Outgoing&StartDate='+parsedURL.query.StartDate.substring(0, 10)+
			'&EndDate='+parsedURL.query.EndDate.substring(0, 10)
	};

	var remoteReq = http.request(options, function(remoteRes) {
		var xml = "<?xml version=\"1.0\" encoding=\"iso-8859-1\"?>\n",
			whereAmI = [],
			nodeData = null,
			ignoreTags = [  ],
			skipThisOne = false;
			
		var parser = {
			"_default": function(text) {
				xml+= htmlEntities(text.trim());
			}
		}
		
		XMLParser.on("opentag", function(data) { // Runs when an XML tag is opened. The data variable contains the name of the tag and it's attributes.
			whereAmI.push(data.name);
			if(skipThisOne) {
				return;
			}
			if(data.name === "LIBRISILLRequest") {
				if(data.attributes.MediaType !== "Lån") {
					skipThisOne = true;
					return;
				}
			}
			xml+= "<"+data.name;
			for(var prop in data.attributes) {
				xml+= " "+prop+"=\""+data.attributes[prop]+"\"";
			}
			xml+= ">";
			nodeData = data;
		});
		XMLParser.on("text", function(text) { // Runs when there is text in an XML tag, not an attribute.
			if(skipThisOne) {
				return;
			}
			// The following two lines fixes the bug in sax when text is run twice, once when the tag opens and once when the tag closes.
			if(whereAmI.length > 0) {
				if(whereAmI[whereAmI.length-1] === nodeData.name) {
					if(ignoreTags.indexOf(nodeData.name) === -1) { // Ignore text processing of the tags in the ignoreTags array
						parser[nodeData.name] ? parser[nodeData.name](text) : parser._default(text);
					}
				}
			}
		});
		XMLParser.on("closetag", function(nodeName) { // Runs when an XML tag is closed.
			if(!skipThisOne) {
				xml+= "</"+nodeName+">\n";
			}
			if(nodeName === "LIBRISILLRequest") {
				skipThisOne = false;
			}
			whereAmI.pop();
		});
		XMLParser.on("end", function(text) { // Runs when all the XML processing is done.
		
			var iconv = new Iconv('UTF-8', 'latin1');
			
			var xmlCopy = iconv.convert(xml);
			
			res.writeHead(200, {'Content-Type': 'application/xml; charset=iso-8859-1'});
			res.end(xmlCopy);
		});
		XMLParser.on("error", function(error) { // Error happended
			console.error(error);
			console.trace();
			res.writeHead(500);
			res.end();
		});
		
		remoteRes.pipe(Iconv('latin1', 'UTF-8')).pipe(XMLParser);
	}).on('error', function(e) {
		console.error(e);
		console.trace();
		res.writeHead(500);
		res.end();
	}).end();
});

function htmlEntities(input) {
	return input.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
		return '&#'+i.charCodeAt(0)+';';
	});
}

server.listen(54274);
