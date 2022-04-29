var config = require("./reader.cnf.json");
var address,
    ifaces = require('os').networkInterfaces();
for (var dev in ifaces) {
    ifaces[dev].filter((details) => details.family === 'IPv4' && details.internal === false ? address = details.address: undefined);
}
console.log(address);
let sw1 = config.sw1;
let sw2 = config.sw2;

var udev = require("udev");
var monitor = udev.monitor("hidraw");
var de=[];
var dev = udev.list("hidraw");
for (const [key,value] of Object.entries(dev)) {
    var kd=value.DEVPATH;
    var kh=value.DEVNAME;
    //console.log(value);
    var kdn=kd.split('/');
    var usbport = kdn[5];
    if (usbport == 'usb6') { 
	// flow out
	switch(kh) {
	    case "/dev/hidraw0": de[0]=sw1;de[1]=sw2; break;
	    case "/dev/hidraw1": de[0]=sw1;de[1]=sw2; break;
	};
    }
    if (usbport == 'usb8') {
	// flow in
	switch(kh) {
	    case "/dev/hidraw0": de[0]=sw2;de[1]=sw1; break;
	    case "/dev/hidraw1": de[0]=sw2;de[1]=sw1; break;
	};
    }
    console.log(kh + "-" + usbport + " - "+de[0]+"-"+de[1]);
}
monitor.on('add',function(device) {
    var kd=device.DEVPATH;
    var kh=device.DEVNAME;
    var kdn=kd.split('/');
    var usbport = kdn[5];
    if (usbport == 'usb6') { 
	// flow in
	switch(kh) {
	    case "/dev/hidraw0": de[0]=sw1;de[1]=sw2; break;
	    case "/dev/hidraw1": de[0]=sw1;de[1]=sw2; break;
	};
    }
    if (usbport == 'usb8') {
	// flow in
	switch(kh) {
	    case "/dev/hidraw0": de[0]=sw2;de[1]=sw1; break;
	    case "/dev/hidraw1": de[0]=sw2;de[1]=sw1; break;
	};
    }
    console.log(kh + "-" + usbport + " - "+de[0]+"-"+de[1]);
});
var turn_id = config.turn_id;
var serverIP = config.serverIP;
var mqtt = require('mqtt')
var Keyboard = require('node-hid-stream').KeyboardLines;
//var Hidstr = require('node-hid-stream').Hidstream;
var hidstream;
var nordv; var nzona; var nmenu; var nmenucat; var cnk = 0; var ulist; var oname;
var companyID = 0; 
var clientID = config.mqttclient;
var https = require('https');
var querystring = require('querystring');

console.log("RFID Publisher started");
const Gpio = require('orange-pi-gpio');
let gpio5 = new Gpio({pin:config.gpio_pin});
let gpio6 = new Gpio({pin:config.gpio_pin2});

var client  = mqtt.connect('mqtt://'+serverIP,
{ 
    username:config.mqttuser,
    password:config.mqttpwd, 
    rejectUnauthorized: false, 
    connectTimeout: 5000,
    keepalive: 60,
    reconnectPeriod: 1000,
    will: {
    topic: 'ahmad/gates/'+config.turn_id+'/status',
    payload: '0',
    qos: 1,
    retain: true
    }
})

function initreader() {
    hidstream = new Keyboard({vendorId: 65535, productId: 53,path:'/dev/hidraw0'});
    hidstream2 = new Keyboard({vendorId: 65535, productId: 53,path:'/dev/hidraw1'});
    //hidstream = new Keyboard({vendorId: , productId: 35});
}
client.on('error', function (err) {
    console.log("MQTT Error: " + err);
});


client.on('message', function(topic,message) {
    var rcm = topic.split("/");
    var nmsg = JSON.parse(message);
    //console.log(topic,message);
    if (rcm[4] == '1') {
	if (sw1 == 1) { sw1 = 2; sw2 = 1; }
	else { sw1 = 1; sw2 = 2; }
    }

    console.log(sw1,sw2);
});
client.on('connect', function () {
    console.log("Connected to MQTT. Opening RFID...");
    client.publish('ahmad/gates/'+config.turn_id+'/status','1', {qos:1, retain:true});
    client.publish('ahmad/gates/'+config.turn_id+'/myip',address, {qos:1, retain:true});
    client.subscribe('ahmad/gates/'+config.turn_id+'/switch/#',{qos:0});

    // connect to RFID and listen to data
    initreader();
    var buffsCount = 0;
    var cardid = '';

    hidstream.on("data",function(data) {
	console.log("Hid1");
	console.log("Flow "+de[0]);
	var postData1 = querystring.stringify({
	    ucid:data,
	    turn_id:config.turn_id,
	    flow:de[0]
	});
	//console.log(postData);
	//preparing for API call
	var start = new Date();
	var options1 = {
	    hostname: serverIP,
	    port: 443,
	    path: '/api/v1/gate?'+postData1,
	    method:'POST',
	    headers: {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Content-Length': postData1.length
	    }
	}
	process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
	let datas = [];
	var req = https.request(options1, (res) => {
	    const contentType =
    	    res.headers["content-type"] &&
    	    res.headers["content-type"].split(";")[0];

	    res.on('data',(d)=> {
		//process.stdout.write(d);
		datas.push(d);
	    });
	    res.on('end',()=> {
		console.log("Statuscode:",res.statusCode);
		console.log(contentType);
		if (datas.length>0 && (contentType == "application/json" || contentType == "application/json, text/html")) {
		var k = JSON.parse(Buffer.concat(datas).toString());
		console.log('Request took:', new Date() - start, 'ms');
		console.log("Statuscode:",res.statusCode);
		console.log(k);
		if (de[0] == 1) {
		    if (k.code == 1) {
		    gpio5.write(1);
		    setTimeout(function() { gpio5.write(0); }, 500);
		    }
		} else {
		    gpio6.write(1);
		    setTimeout(function() { gpio6.write(0);},500);
		}
		}
		return;
	    });
	});
	req.on('error',(e)=> {
	    console.error(e);
	    //reject();
	    process.exit();
	});
	req.write(postData1);
	req.end();

	var recdata = {rfid:data};
	    client.publish('ahmad/gates/'+config.turn_id+'/card',JSON.stringify(recdata), {qos:1, retain:false}, function(err) {
	    if (err) console.log(err);
	 // console.log("publish success: "+recdata);
	});
    });
    
    
    hidstream.on("error",function(error) {
	var d = new Date(); var td = d.getDate(); var tm = d.getMonth; var ty = d.getFullYear();
	var tda = td+"/"+(tm+1)+"/"+ty; var errs = { str: "HID error: "+error, dt: tda };
	client.publish('ahmad/gates/'+config.turn_id+'/error',JSON.stringify(errs), { qos:1, retain:true});
	hidstream.close();
	process.exit();
    });

    hidstream2.on("data",function(data) {
	//console.log(data);
	console.log("HID2");
	console.log("Flow "+de[1]);
	var postData2 = querystring.stringify({
	    ucid:data,
	    turn_id:config.turn_id,
	    flow:de[1]
	});

	//console.log(postData);
	//preparing for API call
	var start = new Date();
	var options2 = {
	    hostname: serverIP,
	    port: 443,
	    path: '/api/v1/gate?'+postData2,
	    method:'POST',
	    headers: {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Content-Length': postData2.length
	    }
	}
	process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
	var req2 = https.request(options2, (res) => {
	    let datas=[];
	    res.on('data',(d)=> {
		datas.push(d);
		console.log(d);
	    });
	    res.on('end',()=> {
		if (datas.length>0) {
		var k = JSON.parse(Buffer.concat(datas).toString());
		console.log('Request took:', new Date() - start, 'ms');
		console.log(k);
		if (de[1] == 1) {
		    if (k.code == 1) {
		    gpio5.write(1);
		    setTimeout(function() { gpio5.write(0); }, 500);
		    }
		} else {
		    gpio6.write(1);
		    setTimeout(function() { gpio6.write(0);},500);
		}
		}
		//resolve(k);
	    });
	});
	req2.on('error',(e)=> {
	    console.error(e);
	    //reject();
	    process.exit();
	});
	req2.write(postData2);
	req2.end();

	    var recdata = {rfid:data};
	    client.publish('ahmad/gates/'+config.turn_id+'/card',JSON.stringify(recdata), {qos:1, retain:false}, function(err) {
	    if (err) console.log(err);
	 // console.log("publish success: "+recdata);
	});
    });
    
    
    hidstream2.on("error",function(error) {
	var d = new Date(); var td = d.getDate(); var tm = d.getMonth; var ty = d.getFullYear();
	var tda = td+"/"+(tm+1)+"/"+ty; var errs = { str: "HID error: "+error, dt: tda };
	client.publish('ahmad/gates/'+config.turn_id+'/error',JSON.stringify(errs), { qos:1, retain:true});
	hidstream2.close();
	process.exit();
    });
    
});

